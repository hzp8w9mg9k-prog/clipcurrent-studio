export default function handler(req,res){
  res.status(200).json({
    ok:true,
    app:"ClipCurrent Studio",
    account:"@clip.currentdaily",
    niche:"Movies",
    pipeline:{
      trend:"ready",
      rights:"ready",
      ingest:"ready",
      transcription:process.env.OPENAI_API_KEY?"configured":"needs_key",
      ranking:"ready",
      rendering:"ready"
    }
  });
}