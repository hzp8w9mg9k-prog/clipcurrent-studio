import fs from "node:fs";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
const execFileAsync=promisify(execFile);
async function extractAudio(videoPath,audioPath){
  await execFileAsync("ffmpeg",["-y","-i",videoPath,"-vn","-ac","1","-ar","16000","-c:a","mp3","-b:a","64k",audioPath]);
}
export async function transcribeVideoWithTimestamps(videoPath){
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const audioPath=`${videoPath}.clipcurrent-audio.mp3`;
  await extractAudio(videoPath,audioPath);
  try{
    const bytes=await fs.promises.readFile(audioPath);
    const form=new FormData();
    form.append("file",new Blob([bytes],{type:"audio/mpeg"}),path.basename(audioPath));
    form.append("model","whisper-1");
    form.append("response_format","verbose_json");
    form.append("timestamp_granularities[]","segment");
    const response=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`},body:form});
    if(!response.ok) throw new Error(`Transcription failed (${response.status})`);
    const result=await response.json();
    return {text:String(result.text||"").trim(),language:result.language||null,duration:result.duration||null,segments:Array.isArray(result.segments)?result.segments.map(s=>({start:Number(s.start),end:Number(s.end),text:String(s.text||"").trim()})):[]};
  }finally{
    await fs.promises.rm(audioPath,{force:true}).catch(()=>{});
  }
}