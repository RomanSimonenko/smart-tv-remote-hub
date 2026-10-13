import {parse, type Node} from 'acorn';
import {testCaseDraftSchema,testCaseStepSchema, type TestCaseStep} from '@remote-webos-tv/contracts';
export const BDD_MAX_BYTES=64*1024;
export type ImportedStep=Pick<TestCaseStep,'kind'|'text'>;
type Ast=Node & {body?:Ast[]|Ast;params?:Ast[];generator?:boolean;expression?:Ast;argument?:Ast;callee?:Ast;arguments?:Ast[];object?:Ast;property?:Ast;computed?:boolean;optional?:boolean;name?:string;value?:unknown};
export interface ImportedScenario {title?:string;steps:ImportedStep[];ignoredCallbacks:number}
export function parseBdd(source:string):ImportedStep[]{return parseBddScenario(source).steps;}
export function parseBddScenario(source:string):ImportedScenario{
 if(new TextEncoder().encode(source).length>BDD_MAX_BYTES) throw new Error('Исходный текст превышает 64 КиБ.');
 let root:Ast;
 try{root=parse(source,{ecmaVersion:'latest',sourceType:'module',allowAwaitOutsideFunction:true,locations:true,preserveParens:true}) as Ast;}
 catch(cause){const loc=(cause as {loc?:{line:number;column:number}}).loc;throw new Error(`Ошибка синтаксиса${loc?` (строка ${loc.line}, столбец ${loc.column+1})`:''}. Проверьте кавычки и скобки.`);}
 const steps:ImportedStep[]=[];let title:string|undefined;let ignoredCallbacks=0;
 function fail(node:Ast,message='Поддерживаются только given, when, then и цепочки .and со строкой в кавычках.'):never{throw new Error(`${message} (строка ${node.loc!.start.line}, столбец ${node.loc!.start.column+1}).`);}
 function callback(node:Ast){
  if(!['ArrowFunctionExpression','FunctionExpression'].includes(node.type)||node.params?.length!==0||node.generator)fail(node,'Второй аргумент должен быть обычной функцией без параметров');
 }
 function path(node:Ast,depth=0):string{
  if(depth>3)return '';
  if(node.type==='Identifier')return node.name!;
  if(node.type==='MemberExpression'&&!node.computed&&!node.optional&&node.property?.type==='Identifier')return `${path(node.object!,depth+1)}.${node.property.name}`;
  return '';
 }
 function literal(node:Ast):string{
  if(node.type!=='Literal'||typeof node.value!=='string'||!['\'','"'].includes(source[node.start]!))return fail(node);
  return node.value;
 }
 function call(node:Ast,depth=0):TestCaseStep['kind']{
  if(depth>=200)return fail(node,'Допускается не более 200 шагов');
  if(node.type!=='CallExpression'||node.optional||!node.arguments||![1,2].includes(node.arguments.length)) return fail(node);
  const arg=node.arguments[0]!;
  const text=literal(arg);
  if(node.arguments[1]){callback(node.arguments[1]);ignoredCallbacks++;}
  const callee=node.callee!;let kind:TestCaseStep['kind'];
  if(callee.type==='Identifier'&&['given','when','then'].includes(callee.name!))kind=callee.name as TestCaseStep['kind'];
  else if(callee.type==='MemberExpression'&&!callee.computed&&!callee.optional&&callee.property?.type==='Identifier'&&callee.property.name==='and')kind=call(callee.object!,depth+1);
  else return fail(callee);
  if(steps.length>=200)return fail(node,'Допускается не более 200 шагов');
  const parsed=testCaseStepSchema.safeParse({id:'00000000-0000-4000-8000-000000000001',kind,text});
  if(!parsed.success)return fail(arg,'Текст шага должен содержать от 1 до 2000 символов');
  steps.push({kind,text:parsed.data.text});return kind;
 }
 let statements=root.body as Ast[];
 if(statements.length===1&&statements[0]!.type==='ExpressionStatement'){
  const expression=statements[0]!.expression!;
  if(expression.type==='CallExpression'&&['scenario','scenario.manual','scenario.skip','scenario.manual.skip'].includes(path(expression.callee!))){
   if(expression.optional||expression.arguments?.length!==2)fail(expression,'Сценарий должен содержать название и функцию с шагами');
   const name=expression.arguments![0]!,handler=expression.arguments![1]!;
   const parsedTitle=testCaseDraftSchema.shape.title.safeParse(literal(name));
   if(!parsedTitle.success)fail(name,'Название должно содержать от 1 до 200 символов');
   title=parsedTitle.data;callback(handler);
   if(!handler.body||Array.isArray(handler.body)||handler.body.type!=='BlockStatement')fail(handler,'Шаги сценария должны находиться внутри блока функции');
   statements=handler.body.body as Ast[];
  }
 }
 for(const statement of statements){
  if(statement.type!=='ExpressionStatement')fail(statement);
  const expression=statement.expression!;
  call(expression.type==='AwaitExpression'?expression.argument!:expression);
 }
 if(!steps.length)throw new Error('Добавьте хотя бы один шаг given, when или then.');
 return {...(title===undefined?{}:{title}),steps,ignoredCallbacks};
}
