export default function handler(req,res){
  const names=Object.keys(process.env).filter(k=>/OPENAI|API|KEY/i.test(k)).sort();
  const hasOpenAIKey=typeof process.env.OPENAI_API_KEY==="string" && process.env.OPENAI_API_KEY.trim().length>0;
  res.status(200).json({
    ok:true,
    app:"ClipCurrent Studio",
    account:"@clip.currentdaily",
    niche:"Movies",
    environment:process.env.VERCEL_ENV || "unknown",
    diagnostics:{
      openaiKeyPresent:hasOpenAIKey,
      matchingEnvironmentVariableNames:names
    },
    pipeline:{
      trend:"ready",
      rights:"ready",
      ingest:"ready",
      transcription:hasOpenAIKey?"configured":"needs_key",
      ranking:"ready",
      rendering:"ready"
    }
  });
}