(async()=>{
  const form=document.getElementById('accountForm');
  const api=async(endpoint,body)=>{
    const r=await fetch('/api/customer/'+endpoint,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    const data=await r.json();if(!r.ok)throw new Error(data.error||'Request failed');return data;
  };
  let current;
  try{current=await api('me');}catch(error){if(form)document.getElementById('formStatus').textContent=error.message;return;}
  const previous=localStorage.getItem('clipflow-customer-id');
  const id=current.user?.id||'';
  if(previous!==id){for(const key of Object.keys(localStorage))if((key.startsWith('clipflow')&&key!=='clipflow-theme')||['currentClips','activeGenerationJobId'].includes(key))localStorage.removeItem(key);sessionStorage.clear();localStorage.setItem('clipflow-customer-id',id);}
  if(!form){
    if(!current.user){location.replace('/account.html');return;}
    const button=document.createElement('button');button.className='customer-account-control';button.textContent='Sign out';button.type='button';button.addEventListener('click',async()=>{await api('logout',{});location.replace('/account.html');});document.body.append(button);return;
  }
  if(current.user && !location.hash.startsWith('#reset=')){location.replace('/');return;}
  const status=document.getElementById('formStatus');
  let mode=location.hash.startsWith('#reset=')?'reset':'login';
  const token=mode==='reset'?location.hash.slice(7):'';
  if(token)history.replaceState(null,'',location.pathname);
  const theme=()=>document.documentElement.classList.toggle('theme-dark',localStorage.getItem('clipflow-theme')!=='light');theme();
  document.getElementById('themeButton').onclick=()=>{localStorage.setItem('clipflow-theme',document.documentElement.classList.contains('theme-dark')?'light':'dark');theme();};
  function show(next){mode=next;status.textContent='';document.getElementById('nameLabel').hidden=mode!=='register';document.getElementById('emailLabel').hidden=mode==='reset';document.getElementById('email').required=mode!=='reset';document.getElementById('passwordLabel').hidden=mode==='forgot';document.getElementById('password').required=mode!=='forgot';document.getElementById('password').autocomplete=mode==='login'?'current-password':'new-password';const title={login:'Welcome back',register:'Create your workspace',forgot:'Recover your account',reset:'Set a new password'}[mode];document.getElementById('formTitle').textContent=title;document.getElementById('submitButton').textContent={login:'Sign in',register:'Create account',forgot:'Send recovery link',reset:'Update password'}[mode];document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));document.querySelector('.tabs').hidden=['forgot','reset'].includes(mode);document.getElementById('forgotButton').hidden=!current.recoveryAvailable||mode!=='login';document.getElementById('backLogin').hidden=!['forgot','reset'].includes(mode);}
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>show(b.dataset.mode));document.getElementById('forgotButton').onclick=()=>show('forgot');show(mode);
  form.onsubmit=async event=>{event.preventDefault();const button=document.getElementById('submitButton');button.disabled=true;status.textContent='Please wait…';try{const data=await api(mode,{email:document.getElementById('email').value,password:document.getElementById('password').value,name:document.getElementById('name').value,token});if(['login','register'].includes(mode))location.replace('/');else status.textContent=data.message;}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
})();
