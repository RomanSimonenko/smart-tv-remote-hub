"""One bounded image per process; models must already exist locally."""
import contextlib
import json
import os
from pathlib import Path
import sys


def recognize():
    header = json.loads(sys.stdin.buffer.readline(256))
    image_size = header.get('imageBytes')
    if type(image_size) is not int or not 0 < image_size <= 5 * 1024 * 1024:
        raise ValueError('Invalid image size')
    image = sys.stdin.buffer.read(image_size)
    if len(image) != image_size:
        raise ValueError('Invalid image size')
    models = Path(os.environ.get('REMOTE_WEBOS_OCR_MODELS', str(Path(__file__).resolve().parent / 'models')))
    detector = models / 'PP-OCRv5_mobile_det'
    recognizer = models / 'eslav_PP-OCRv5_mobile_rec'
    for directory in (detector, recognizer):
        for name in ('inference.json', 'inference.pdiparams', 'inference.yml'):
            if not (directory / name).is_file():
                raise ValueError('Packaged OCR model missing')
    output = sys.stdout
    model = 'PP-OCRv5_mobile_det+eslav_PP-OCRv5_mobile_rec'
    # Paddle may write initialization diagnostics to stdout; reserve stdout for JSON.
    with contextlib.redirect_stdout(sys.stderr):
        import cv2
        import numpy as np
        from paddleocr import PaddleOCR, TextRecognition
        from paddlex.inference.pipelines.components.common.crop_image_regions import CropByPolys
        frame = cv2.imdecode(np.frombuffer(image, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError('Invalid image')
        ocr = PaddleOCR(
            text_detection_model_name='PP-OCRv5_mobile_det',
            text_detection_model_dir=str(detector),
            text_recognition_model_name='eslav_PP-OCRv5_mobile_rec',
            text_recognition_model_dir=str(recognizer),
            use_doc_orientation_classify=False, use_doc_unwarping=False,
            use_textline_orientation=False, device='cpu',
            enable_mkldnn=False, cpu_threads=4,
        )
        results = list(ocr.predict(frame))
        if len(results) != 1:
            raise ValueError('Invalid OCR result')
        data = results[0].json
        if isinstance(data, str):
            data = json.loads(data)
        data = data['res']
        texts = data['rec_texts']
        if not isinstance(texts, list) or any(not isinstance(text, str) for text in texts):
            raise ValueError('Invalid OCR text')
        source_indices = [index for index, text in enumerate(texts) if text.strip()]
        blocks = [{'text': texts[index].strip()} for index in source_indices]
        base = {'blocks': blocks, 'engine': 'paddleocr-3.2.0', 'model': model}
        output.write(json.dumps({'phase': 'base', 'result': base}, ensure_ascii=False) + '\n')
        output.flush()
        request = json.loads(sys.stdin.buffer.readline(4096))
        indices = request.get('retryIndices')
        if (not isinstance(indices, list) or len(indices) > min(3, 1000 - len(blocks))
                or any(type(index) is not int or not 0 <= index < len(blocks) for index in indices)
                or len(set(indices)) != len(indices)):
            raise ValueError('Invalid retry request')
        if indices:
            # Reuse the original frame and crop geometry; do not repeat text detection.
            retry = TextRecognition(
                model_name='eslav_PP-OCRv5_mobile_rec', model_dir=str(recognizer),
                input_shape=[3, 48, 640], device='cpu', enable_mkldnn=False, cpu_threads=4,
            )
            cropper = CropByPolys()
            for index in indices:
                crop = cropper(frame, [data['rec_polys'][source_indices[index]]])[0]
                result = retry.predict(crop)
                if len(result) != 1:
                    raise ValueError('Invalid retry result')
                value = result[0].json
                if isinstance(value, str):
                    value = json.loads(value)
                text = value['res']['rec_text']
                if not isinstance(text, str):
                    raise ValueError('Invalid retry text')
                if text.strip():
                    blocks.append({'text': text.strip()})
            model += '+line-retry-640'
    return {'blocks': blocks, 'engine': 'paddleocr-3.2.0', 'model': model}



try:
    sys.stdout.write(json.dumps({'phase': 'result', 'result': recognize()}, ensure_ascii=False) + '\n')
except Exception:
    # Parent reports the specific lifecycle failure; never log screen contents.
    sys.exit(1)
