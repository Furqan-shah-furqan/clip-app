const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
test('OAuth callbacks use the live Render service and preserve explicit custom-domain callbacks',()=>{
  const source='console.log(JSON.stringify(require("./server/config/env")))';
  const run=(overrides)=>{
    const r=spawnSync(process.execPath,['-e',source],{cwd:path.join(__dirname,'..'),encoding:'utf8',env:{...process.env,DATABASE_URL:'test',REDIS_URL:'test',APP_URL:'https://old.onrender.com',RENDER_EXTERNAL_URL:'https://clip-clipflow-studio.onrender.com',GOOGLE_REDIRECT_URI:'https://old.onrender.com/api/auth/youtube/callback',INSTAGRAM_REDIRECT_URI:'',...overrides}});
    assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout.trim().split('\n').pop());
  };
  const env=run({});
  assert.equal(env.GOOGLE_REDIRECT_URI,'https://clip-clipflow-studio.onrender.com/api/auth/youtube/callback');
  assert.equal(env.INSTAGRAM_REDIRECT_URI,'https://clip-clipflow-studio.onrender.com/api/auth/instagram/callback');
  assert.equal(run({GOOGLE_REDIRECT_URI:'https://custom.example/api/auth/youtube/callback'}).GOOGLE_REDIRECT_URI,'https://custom.example/api/auth/youtube/callback');
});
test('OAuth status pages escape provider text and return links',()=>{
  const fs=require('node:fs');
  const source=fs.readFileSync(path.join(__dirname,'../server/routes/auth.js'),'utf8');
  const start=source.indexOf('function buildSafeReturnTo('),end=source.indexOf('function startYouTubeOAuth(',start);
  const render=new Function(source.slice(start,end)+'; return sendConnectedHtml;')();
  const html=render({title:'<script>bad</script>',message:'<img src=x onerror=alert(1)>',returnTo:'/publish.html?x=" onload="alert(1)'});
  assert.equal(html.includes('<script>bad'),false);
  assert.equal(html.includes('<img src='),false);
  assert.equal(html.includes('x=" onload='),false);
});
