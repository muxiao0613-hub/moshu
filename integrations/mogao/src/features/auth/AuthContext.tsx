/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
import {createContext,useContext,type ReactNode} from 'react';
export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
  roles: string[];
  permissions: string[];
  apiKey: string | null;
  apiBaseUrl: string;
  aiModel: string;
  aiMode: 'byok' | 'managed';
  balance: number;
  isMember: boolean;
  membershipExpiresAt: string | null;
  membershipPlan: string | null;
}

const local:AuthUser={id:'local',email:'',nickname:'本地作者',roles:[],permissions:[],apiKey:null,apiBaseUrl:'',aiModel:'',aiMode:'byok',balance:0,isMember:false,membershipExpiresAt:null,membershipPlan:null};
const context=createContext({user:local,loading:false,hasPerm:(_code:string)=>false,
 refreshUser:async()=>{},updateSettings:async(_data:unknown)=>{},
 login:async(_email:string,_password:string)=>{throw new Error('本地空间无需登录。');},
 register:async(_email:string,_password:string,_nickname:string)=>{throw new Error('本地空间无需注册。');},logout:async()=>{}});
export function AuthProvider({children}:{children:ReactNode}){return <context.Provider value={useContext(context)}>{children}</context.Provider>;}
export function useAuth(){return useContext(context);}
