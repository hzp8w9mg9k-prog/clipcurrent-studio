export default async function handler(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({ok:false,error:"Method not allowed"});}
  const youtubeKey=process.env.YOUTUBE_API_KEY;
  const geminiKey=process.env.GEMINI_API_KEY;
  const q=String(req.query.q||"wild intense movie scenes trailers").trim().slice(0,120);
  if(!youtubeKey) return res.status(503).json({ok:false,error:"YOUTUBE_API_KEY is not configured",setupNeeded:"youtube"});

  const fallbackPackage=(x)=>({
    reelTitle:"This movie moment is absolutely wild",
    hook:"Wait for the moment this completely changes.",
    description:`One of the most intense movie moments we found from ${x.title}. Watch through to the payoff.`,
    hashtags:["#movies","#movieclips","#cinema","#reels","#viral"],
    editAngle:"Lead with the strongest visual or reaction immediately, cut dead space, keep the payoff early, and end on the most memorable beat."
  });

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
      const title=v.snippet?.title||"";
      const intensityTerms=/wild|insane|crazy|epic|fight|battle|death|reveal|twist|final|ending|scary|horror|chase|explosion|shock|best scene|iconic|legendary|emotional|rage|revenge|villain|monster/i.test(title)?20:0;
      const fallbackScore=Math.round(Math.log10(views+1)*18 + Math.log10(likes+1)*7 + Math.max(0,30-ageDays) + intensityTerms);
      const item={
        id:v.id,title,
        description:v.snippet?.description||"",
        channel:v.snippet?.channelTitle||"",
        publishedAt,
        thumbnail:v.snippet?.thumbnails?.high?.url||v.snippet?.thumbnails?.medium?.url||v.snippet?.thumbnails?.default?.url||"",
        views,likes,duration:v.contentDetails?.duration||"",
        url:"https://www.youtube.com/watch?v="+v.id,
        score:fallbackScore,
        reason:"Ranked for recency, engagement, and high-intensity movie keywords.",
        rightsStatus:"needs_rights_check"
      };
      item.package=fallbackPackage(item);
      return item;
    }).sort((a,b)=>b.score-a.score);

    let ranked=base.slice(0,5), chooser="fallback";
    if(geminiKey){
      const prompt=`You are ClipCurrent's Free Mode selector for an Instagram movie-Reels account.
Choose the MOST scroll-stopping, wild, emotionally intense, visually memorable, suspenseful, shocking, funny, spectacular, or iconic candidates from the supplied YouTube metadata.
Do not assume a video is licensed for reuse. This is discovery/ranking only.
Do not favor gore or graphic harm just for shock value.
For each selected candidate create a COMPLETE Instagram Reel package.

Return ONLY JSON:
{
  "ranked":[
    {
      "id":"VIDEO_ID",
      "score":0-100,
      "reason":"why this is a strong high-attention candidate",
      "reelTitle":"short punchy Reel title",
      "hook":"first-line/on-screen hook",
      "description":"ready-to-post Instagram caption/description",
      "hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5"],
      "editAngle":"what moment/style to emphasize when editing"
    }
  ]
}

Rules:
- Rank strongest attention potential first.
- Exactly 5 hashtags for each result.
- Avoid misleading claims about what happens in footage you cannot verify from metadata.
- Keep titles/hooks punchy, not spammy.
- Never say footage is cleared or free to reuse.

Candidates:
${JSON.stringify(base.slice(0,10).map(({id,title,description,channel,publishedAt,views,likes})=>({id,title,description:description.slice(0,350),channel,publishedAt,views,likes})))}`;

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
            const tags=Array.isArray(r.hashtags)?r.hashtags.slice(0,5):x.package.hashtags;
            return {
              ...x,
              score:Number(r.score||x.score),
              reason:String(r.reason||x.reason),
              package:{
                reelTitle:String(r.reelTitle||x.package.reelTitle),
                hook:String(r.hook||x.package.hook),
                description:String(r.description||x.package.description),
                hashtags:tags,
                editAngle:String(r.editAngle||x.package.editAngle)
              }
            };
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