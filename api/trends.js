export default async function handler(req,res){
  if(req.method!=="GET"){
    res.setHeader("Allow","GET");
    return res.status(405).json({ok:false,error:"Method not allowed"});
  }

  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey){
    return res.status(503).json({ok:false,error:"OPENAI_API_KEY is not configured"});
  }

  const today=new Date().toISOString().slice(0,10);
  const prompt=`
You are ClipCurrent Trend Scout for an Instagram account that posts movie-focused short-form videos.
Today is ${today}. Research what movie titles, characters, scenes, releases, trailers, casting news, box-office stories, anniversaries, or movie conversations are getting notable attention right now.

Return ONLY valid JSON with this exact shape:
{
  "trends": [
    {
      "title": "movie or topic",
      "signal": "short description of why it is currently hot",
      "why": "one sentence explaining the short-form opportunity",
      "clip_angle": "a concrete Reel concept",
      "source_status": "needs_rights_check"
    }
  ]
}

Rules:
- Return 5 trends.
- Prefer timely, current signals over evergreen movie trivia.
- Do not claim any copyrighted footage is cleared for reuse.
- Every item must use source_status = "needs_rights_check".
- Do not include markdown fences or extra commentary.
`.trim();

  try{
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{
        "Authorization":`Bearer ${apiKey}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        model:"gpt-5.6-luna",
        tools:[{type:"web_search",search_context_size:"medium"}],
        input:prompt,
        max_output_tokens:1400
      })
    });

    const data=await response.json();
    if(!response.ok){
      return res.status(response.status).json({
        ok:false,
        error:data?.error?.message || "Trend research request failed"
      });
    }

    const outputText=(data.output||[])
      .filter(item=>item.type==="message")
      .flatMap(item=>item.content||[])
      .filter(part=>part.type==="output_text")
      .map(part=>part.text||"")
      .join("")
      .trim();

    let parsed;
    try{
      parsed=JSON.parse(outputText);
    }catch{
      const match=outputText.match(/\{[\s\S]*\}/);
      if(!match) throw new Error("Trend response was not valid JSON");
      parsed=JSON.parse(match[0]);
    }

    const trends=Array.isArray(parsed.trends)?parsed.trends.slice(0,5):[];
    res.setHeader("Cache-Control","s-maxage=3600, stale-while-revalidate=300");
    return res.status(200).json({
      ok:true,
      researchedAt:new Date().toISOString(),
      account:"@clip.currentdaily",
      niche:"Movies",
      trends
    });
  }catch(error){
    return res.status(500).json({
      ok:false,
      error:error?.message || "Unable to research movie trends"
    });
  }
}