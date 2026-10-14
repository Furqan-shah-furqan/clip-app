(()=>{
 const button=document.getElementById('publicThemeButton');
 function apply(){let preference='dark';try{preference=localStorage.getItem('clipflow-theme')||'dark';}catch{}const dark=preference!=='light';document.documentElement.classList.toggle('theme-dark',dark);if(button){button.setAttribute('aria-checked',String(dark));button.textContent=dark?'Night mode':'Day mode';}}
 apply();
 if(button)button.onclick=()=>{const preference=document.documentElement.classList.contains('theme-dark')?'light':'dark';try{localStorage.setItem('clipflow-theme',preference);}catch{document.documentElement.classList.toggle('theme-dark',preference==='dark');button.setAttribute('aria-checked',String(preference==='dark'));button.textContent=preference==='dark'?'Night mode':'Day mode';return;}apply();};
})();
