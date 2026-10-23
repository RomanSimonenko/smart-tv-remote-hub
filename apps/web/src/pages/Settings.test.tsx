// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {Settings} from './Settings.js';
import {api,ApiFailure} from '../api.js';
import {i18n} from '../i18n.js';
const policy={automatic:false,days:30,keepUnsuccessful:true};
const summary={policy,databaseBytes:100,backupBytes:0,otherBytes:0,totalBytes:200,freeBytes:1000,reports:{count:1,bytes:50},snapshots:{count:1,bytes:100,quotaBytes:1000},pendingFiles:0};
const token='00000000-0000-4000-8000-000000000001';
HTMLDialogElement.prototype.showModal=function(){this.open=true;};
HTMLDialogElement.prototype.close=function(){this.open=false;};
afterEach(()=>{cleanup();vi.restoreAllMocks();void i18n.changeLanguage('ru');});
function setup(){
 vi.spyOn(api,'storageSummary').mockResolvedValue(summary);
 vi.spyOn(api,'previewCleanup').mockResolvedValue({token,expiresAt:Date.now()+60_000,candidates:[{id:token,title:'Synthetic old run',endedAt:1,revision:0,snapshots:1,snapshotBytes:100,reportBytes:50}],snapshotBytes:100,reportBytes:50,truncated:false});
 vi.spyOn(api,'cleanupStorage').mockResolvedValue({deleted:1,pendingFiles:0});
 return render(<Settings csrfToken="synthetic" onSessionExpired={vi.fn()} onDirtyChange={vi.fn()}/>);
}
test('storage previews exact candidates and only deletes after a separate confirmation',async()=>{
 setup();fireEvent.click(screen.getByRole('button',{name:'Хранение'}));
 await screen.findByText('Хранение данных');fireEvent.click(await screen.findByRole('button',{name:'Просмотреть кандидатов'}));
 await screen.findByText('Synthetic old run');expect(api.cleanupStorage).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Удалить результаты'}));
 await waitFor(()=>expect(api.cleanupStorage).toHaveBeenCalledWith(token,'synthetic',expect.any(AbortSignal)));
 expect(await screen.findByText('Удалено результатов: 1.')).toBeTruthy();
});
test('policy saves changed values, keeps unsaved edits on failure and flags dirty state',async()=>{
 const dirty=vi.fn();vi.spyOn(api,'storageSummary').mockResolvedValue(summary);const save=vi.spyOn(api,'saveStoragePolicy').mockRejectedValue(new ApiFailure(0,'NETWORK_ERROR'));
 render(<Settings csrfToken="synthetic" onSessionExpired={vi.fn()} onDirtyChange={dirty}/>);fireEvent.click(screen.getByRole('button',{name:'Хранение'}));
 fireEvent.change(await screen.findByLabelText('Срок хранения, дней'),{target:{value:'90'}});expect(dirty).toHaveBeenLastCalledWith(true);
 fireEvent.click(screen.getByRole('button',{name:'Сохранить изменения'}));await screen.findByRole('alert');expect((screen.getByLabelText('Срок хранения, дней') as HTMLInputElement).value).toBe('90');expect(save).toHaveBeenCalled();
});
test('diagnostics show actual checks, unknown OCR and retry errors in English',async()=>{
 await i18n.changeLanguage('en');const diagnostics={checkedAt:1,applicationVersion:'0.0.0',nodeVersion:'22.0.0',sqliteVersion:'3.0.0',schemaVersion:11,checks:{api:'ok' as const,database:'ok' as const,storage:'error' as const},ocr:{state:'unknown' as const,engine:null,model:null},cleanup:{pendingFiles:0,lastAutomaticCheckAt:null,lastAutomaticError:false}};
 const request=vi.spyOn(api,'diagnostics').mockRejectedValueOnce(new ApiFailure(0,'NETWORK_ERROR')).mockResolvedValue(diagnostics);
 render(<Settings csrfToken="synthetic" onSessionExpired={vi.fn()} onDirtyChange={vi.fn()}/>);fireEvent.click(screen.getByRole('button',{name:'Diagnostics'}));
 await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Check again'}));await screen.findByText('Unknown');expect(request).toHaveBeenCalledTimes(2);expect(screen.getByRole('button',{name:'Download report'}).hasAttribute('disabled')).toBe(false);
});
test('cleanup failure stays visible inside the confirmation dialog and does not close the preview',async()=>{
 setup();vi.mocked(api.cleanupStorage).mockRejectedValue(new ApiFailure(409,'CLEANUP_PREVIEW_STALE'));
 fireEvent.click(screen.getByRole('button',{name:'Хранение'}));fireEvent.click(await screen.findByRole('button',{name:'Просмотреть кандидатов'}));
 const dialog=await screen.findByRole('dialog',{name:'Подтверждение очистки'});fireEvent.click(screen.getByRole('button',{name:'Удалить результаты'}));
 await waitFor(()=>expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('Список изменился'));
});
test('switching sections protects an unsaved retention policy',async()=>{
 setup();fireEvent.click(screen.getByRole('button',{name:'Хранение'}));fireEvent.change(await screen.findByLabelText('Срок хранения, дней'),{target:{value:'90'}});
 fireEvent.click(screen.getByRole('button',{name:'Интерфейс'}));expect(screen.getByRole('dialog',{name:'Несохранённые изменения'})).toBeTruthy();
 fireEvent.click(screen.getByText('Остаться',{selector:'button'}));expect((screen.getByLabelText('Срок хранения, дней') as HTMLInputElement).value).toBe('90');
});
