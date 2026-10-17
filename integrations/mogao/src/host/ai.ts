/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
import type OpenAI from 'openai';
import {host} from './bridge';
export interface AIConfig {baseURL:string;model:string;persistent:boolean;configured:boolean}
let config:AIConfig={baseURL:'https://api.deepseek.com',model:'deepseek-chat',persistent:false,configured:false};
export function currentConfig(){return config;}
export async function loadConfig(){config=await host<AIConfig>('ai-settings');return config;}
export async function saveConfig(settings:AIConfig & {apiKey?:string;clear?:boolean}) {
 config=await host<AIConfig>('ai-settings',{settings});return config;
}
type StreamParams=OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
type PlainParams=OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
type Chunk=OpenAI.Chat.Completions.ChatCompletionChunk;
type Completion=OpenAI.Chat.Completions.ChatCompletion;
type Options={signal?:AbortSignal|null;headers?:unknown};
async function create(params:StreamParams,opts?:Options):Promise<AsyncIterable<Chunk>>;
async function create(params:PlainParams,opts?:Options):Promise<Completion>;
async function create(params:StreamParams|PlainParams,opts:Options={}):Promise<AsyncIterable<Chunk>|Completion> {
 const id=crypto.randomUUID();
 if(opts.signal?.aborted)throw new DOMException('已停止生成','AbortError');
 const cancel=()=>{void host('ai-cancel',{id});};
 opts.signal?.addEventListener('abort',cancel,{once:true});
 if(!params.stream) {try{return await host<Completion>('ai',{payload:params},{id});}finally{opts.signal?.removeEventListener('abort',cancel);}}
 const queue:Chunk[]=[];let done=false;let failure:unknown;let wake:()=>void=()=>{};
 const task=host('ai',{payload:params},{id,chunk:value=>{queue.push(value as Chunk);wake();}})
  .catch(error=>{failure=error;}).finally(()=>{done=true;wake();opts.signal?.removeEventListener('abort',cancel);});
 return {
  async *[Symbol.asyncIterator]() {
   try {
    while(!done || queue.length) {
     if(queue.length){yield queue.shift()!;continue;}
     await new Promise<void>(resolve=>{wake=resolve;});
    }
    if(failure){if((failure as {code?:string}).code==='CANCELLED')throw new DOMException('已停止生成','AbortError');throw failure;}
   } finally {if(!done)cancel();await task;}
  },
 };
}
export function nativeClient(){return {chat:{completions:{create}}};}
