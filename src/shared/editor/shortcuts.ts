import {createContext} from 'react';
export const ShortcutContext=createContext<Record<string,string>>({search:'K',newNote:'N',save:'S'});
