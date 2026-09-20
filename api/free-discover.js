export default async function handler(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({ok:false,error:"Method not allowed"});}
  const youtubeKey=process.env.YOUTUBE_API_KEY;
  const geminiKey=process.env.GEMINI_API_KEY;
  const q=String(req.query.q||"movie scenes trailers").trim().slice(0,120);
  if(!youtubeKey) return res.status(503).json({ok:false,error:"YOUTUBE_API_KEY is not configured",setupNeeded:"youtube"});

  try{
    const searchUrl=new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.search=new URLSearchParams({
      part:"snippet",type:"video",maxResults:"12",q,
      order:"relevance",safeSearch:"moderate",key:youtubeKey
    }).toString();
    const sr=await fetch(searchUrl);
    const sd=await sr.json();
    if(!sr.ok) return res.status(sr.status).json({ok:false,error:sd?.error?.message||"YouTube search failed"});

    const ids=(sd.items||[]).map(x=>x.id?.videoId).filter(Boolean);
    if(!ids.length) return res.status(200).json({ok:true,mode:"youtube",query:q,items:[]});

    const statsUrl=new URL("https://www.googleapis.com/youtube/v3/videos");
    statsUrl.search=new URLSearchParams({part:"snippet,statistics,contentDetails",id:ids.join(","),key:youtubeKey}).toString();
    const vr=await fetch(statsUrl);
    const vd=await vr.json();
    if(!vr.ok) return res.status(vr.status).json({ok:false,error:vd?.error?.message||"YouTube stats failed"});

    const base=(vd.items||[]).map(v=>{
      const views=Number(v.statistics?.viewCount||0);
      const likes=Number(v.statistics?.likeCount||0);
      const publishedAt=v.snippet?.publishedAt||"";
      const ageDays=Math.max(1,(Date.now()-new Date(publishedAt).getTime())/86400000);
      const fallbackScore=Math.round(Math.log10(views+1)*18 + Math.log10(likes+1)*7 + Math.max(0,30-ageDays));
      return {
        id:v.id,
        title:v.snippet?.title||"",
        channel:v.snippet?.channelTitle||"",
        publishedAt,
        thumbnail:v.snippet?.thumbnails?.medium?.url||v.snippet?.thumbnails?.default?.url||"",
        views,likes,duration:v.contentDetails?.duration||"",
        url:"https://www.youtube.com/watch?v="+v.id,
        score:fallbackScore,
        reason:"Ranked by recency and public engagement signals.",
        rightsStatus:"needs_rights_check"
      };
    }).sort((a,b)=>b.score-a.score);

    let ranked=base.slice(0,5), chooser="fallback";
    if(geminiKey){
      const prompt=`You are selecting YouTube discovery candidates for a movie-focused Instagram Reels workflow.
Rank the supplied videos from best to worst for short-form editorial potential. Do NOT say footage is cleared for reuse.
Return ONLY JSON: {"ranked":[{"id":"VIDEO_ID","score":0-100,"reason":"short reason"}]}
Candidates:
${JSON.stringify(base.slice(0,10).map(({id,title,channel,publishedAt,views,likes})=>({id,title,channel,publishedAt,views,likes})))}`;
      const gr=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-goog-api-key":geminiKey},
        body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json"}})
      });
      const gd=await gr.json();
      if(gr.ok){
        const txt=gd?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim();
        try{
          const parsed=JSON.parse(txt);
          const map=new Map(base.map(x=>[x.id,x]));
          const ai=(parsed.ranked||[]).map(r=>{
            const x=map.get(r.id); if(!x)return null;
            return {...x,score:Number(r.score||x.score),reason:String(r.reason||x.reason)}
          }).filter(Boolean);
          if(ai.length){ranked=ai.slice(0,5);chooser="gemini-free";}
        }catch{}
      }
    }

    res.setHeader("Cache-Control","no-store");
    return res.status(200).json({ok:true,query:q,chooser,items:ranked});
  }catch(e){
    return res.status(500).json({ok:false,error:e?.message||"Free discovery failed"});
  }
}