export interface PetPreferences {revision:number;enabled:boolean;alwaysOnTop:boolean;size:'small'|'medium'|'large'}
export interface DesktopPetState {preferences:PetPreferences;visible:boolean}
export interface PetCommands {
  pet_drag:{input:{dragId:string;phase:'start'|'move'|'end';x:number;y:number};output:null};
  get_desktop_pet:{input:Record<string,never>;output:DesktopPetState};
  save_desktop_pet:{input:{baseRevision:number;preferences:PetPreferences};output:DesktopPetState};
  pet_action:{input:{action:'openWorkspace'|'hide'|'recenter'|'greet'};output:null};
}
