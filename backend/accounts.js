export const DEFAULT_ACCOUNT={
  id:"clipcurrent-movies",
  handle:"@clip.currentdaily",
  niche:"movies",
  status:"active",
  settings:{candidatesPerDay:3,language:"en",platform:"instagram"}
};
export function createAccountWorkspace({id,handle,niche}){
  return {id,handle,niche,status:"setup",trendProfile:{},rightsRules:{},renderStyle:{},learningProfile:{},analyticsProfile:{}};
}