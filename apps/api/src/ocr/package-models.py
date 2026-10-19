"""Build-time only download and integrity check of the two production models."""
import hashlib
from pathlib import Path
import os
os.environ['PADDLE_PDX_MODEL_SOURCE'] = 'bos'
from paddleocr import PaddleOCR
PaddleOCR(text_detection_model_name='PP-OCRv5_mobile_det',
          text_recognition_model_name='eslav_PP-OCRv5_mobile_rec',
          use_doc_orientation_classify=False, use_doc_unwarping=False,
          use_textline_orientation=False, device='cpu',
          enable_mkldnn=False, cpu_threads=4)

expected = {'PP-OCRv5_mobile_det/inference.json': '05feef1acb00aa4cd7362b15f7f501fc4f99d7b1fa73c1c871e0c7b1504b0f5c', 'PP-OCRv5_mobile_det/inference.pdiparams': 'afa1820cb16c1fd0dad589d0f8b389139061c1ef6d68019685fd07be997dda5b', 'PP-OCRv5_mobile_det/inference.yml': '98069072e1b6b37d727fd9d9f11725faa46d6ea0de012f2ed26caea011c37699', 'eslav_PP-OCRv5_mobile_rec/inference.json': '3fb6e2e658f5139ff16e35260de8f0577f106a9505c902e1dfc1f4f1d03cc9cb', 'eslav_PP-OCRv5_mobile_rec/inference.pdiparams': 'f11057b05d8517868bca505271278973d706600d9dcc184cbcf5c4512091c32b', 'eslav_PP-OCRv5_mobile_rec/inference.yml': '025039bac23eb4a308efcefa4d58eab3af440767815c6ba6938468bf6353ee5a'}
root = Path(os.environ['PADDLE_PDX_CACHE_HOME']) / 'official_models'
for name, digest in expected.items():
    if hashlib.sha256((root / name).read_bytes()).hexdigest() != digest:
        raise RuntimeError('OCR model integrity mismatch: ' + name)
