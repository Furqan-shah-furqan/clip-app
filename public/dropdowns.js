/* Enhance selects without changing existing form/change-event contracts. */
(() => {
  const instances = new WeakMap();
  let opened = null, sequence = 0;
  const close = (focus = false) => {
    if (!opened) return;
    const current = opened; opened = null;
    current.menu.hidden = true;
    current.button.setAttribute('aria-expanded', 'false');
    if (focus) current.button.focus();
  };
  function enhance(select) {
    if (instances.has(select) || select.multiple || select.size > 1) return;
    const wrap = document.createElement('div'); wrap.className = 'cf-select';
    select.before(wrap); wrap.append(select);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'cf-select-trigger';
    const label = document.createElement('span'); button.append(label); wrap.append(button);
    const menu = document.createElement('div'); menu.className = 'cf-select-menu'; menu.hidden = true;
    menu.id = `cf-select-menu-${++sequence}`; menu.setAttribute('role', 'listbox'); document.body.append(menu);
    button.setAttribute('aria-haspopup', 'listbox'); button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', menu.id);
    select.classList.add('cf-native'); select.tabIndex = -1; select.setAttribute('aria-hidden','true');
    const name = () => select.getAttribute('aria-label') || Array.from(select.labels || []).map(el => el.querySelector('span')?.textContent || el.textContent).join(' ').trim() || 'Select option';
    const sync = () => {
      label.textContent = select.selectedOptions[0]?.textContent || 'Choose an option';
      button.disabled = select.disabled;
      button.setAttribute('aria-label', `${name()}: ${label.textContent}`);
      button.setAttribute('aria-required', String(select.required));
      menu.setAttribute('aria-label', name());
    };
    const instance = {menu,button}; instances.set(select,instance);
    function open() {
      if (select.disabled) return;
      close(); sync(); menu.replaceChildren();
      const title = document.createElement('div'); title.className='cf-select-menu-title'; title.textContent=name(); menu.append(title);
      let lastGroup=null;
      Array.from(select.options).forEach((option,index) => {
        if (option.hidden) return;
        const group=option.parentElement.tagName==='OPTGROUP' ? option.parentElement : null;
        if (group && group!==lastGroup) { const h=document.createElement('div');h.className='cf-select-group';h.textContent=group.label;menu.append(h); }
        lastGroup=group;
        const row=document.createElement('div'); row.className='cf-select-option';row.textContent=option.textContent;row.tabIndex=-1;
        row.setAttribute('role','option');row.setAttribute('aria-selected',String(index===select.selectedIndex));
        row.setAttribute('aria-disabled',String(option.disabled || !!group?.disabled));
        row.addEventListener('click',() => {
          if (row.getAttribute('aria-disabled')==='true') return;
          select.selectedIndex=index;sync();close(true);
          select.dispatchEvent(new Event('input',{bubbles:true}));
          select.dispatchEvent(new Event('change',{bubbles:true}));
        });
        menu.append(row);
      });
      const rect=button.getBoundingClientRect(), roomBelow=innerHeight-rect.bottom-12, roomAbove=rect.top-12;
      const above=roomBelow<180 && roomAbove>roomBelow;
      menu.style.width=`${Math.min(Math.max(rect.width,220),innerWidth-16)}px`;
      menu.style.maxHeight=`${Math.max(80,Math.min(320,above?roomAbove:roomBelow))}px`;
      menu.style.left=`${Math.max(8,Math.min(rect.left,innerWidth-parseFloat(menu.style.width)-8))}px`;
      menu.style.top=above?'auto':`${rect.bottom+6}px`; menu.style.bottom=above?`${innerHeight-rect.top+6}px`:'auto';
      menu.hidden=false;opened=instance;button.setAttribute('aria-expanded','true');
      (menu.querySelector('[aria-selected=true]:not([aria-disabled=true])') || menu.querySelector('[role=option]:not([aria-disabled=true])'))?.focus();
    }
    button.addEventListener('click',() => opened===instance?close():open());
    button.addEventListener('keydown',event => {if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open();}});
    let typeahead='', typedAt=0;
    menu.addEventListener('keydown',event => {
      const rows=Array.from(menu.querySelectorAll('[role=option]:not([aria-disabled=true])'));
      const index=rows.indexOf(document.activeElement);
      if(event.key==='Escape'){event.preventDefault();close(true);return;}
      if(event.key==='Tab'){close(true);return;}
      if(['Enter',' '].includes(event.key)){event.preventDefault();rows[index]?.click();return;}
      let next;
      if(event.key==='ArrowDown') next=(index+1)%rows.length;
      if(event.key==='ArrowUp') next=(index-1+rows.length)%rows.length;
      if(event.key==='Home') next=0;
      if(event.key==='End') next=rows.length-1;
      if(next!==undefined){event.preventDefault();rows[next]?.focus();rows[next]?.scrollIntoView({block:'nearest'});}
      else if(event.key.length===1 && !event.ctrlKey && !event.metaKey){
        typeahead=(Date.now()-typedAt>700?'':typeahead)+event.key.toLowerCase();typedAt=Date.now();
        rows.find(row=>row.textContent.toLowerCase().startsWith(typeahead))?.focus();
      }
    });
    select.addEventListener('change',sync);
    select.addEventListener('invalid',event=>{event.preventDefault();button.focus();button.setAttribute('aria-invalid','true');});
    button.addEventListener('click',()=>button.removeAttribute('aria-invalid'));
    select.form?.addEventListener('reset',()=>setTimeout(sync,0));
    // Presets and account loading assign values without emitting a change event.
    for(const key of ['value','selectedIndex']){
      const descriptor=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,key);
      Object.defineProperty(select,key,{configurable:true,get(){return descriptor.get.call(this);},set(value){descriptor.set.call(this,value);sync();}});
    }
    new MutationObserver(sync).observe(select,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','selected','label','required']});
    sync();
  }
  const scan=()=>document.querySelectorAll('select').forEach(enhance);
  document.addEventListener('pointerdown',event=>{if(opened && !opened.menu.contains(event.target) && !opened.button.contains(event.target))close();});
  window.addEventListener('resize',()=>close());
  window.addEventListener('scroll',event=>{if(opened && !opened.menu.contains(event.target))close();},true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();
  new MutationObserver(records=>{if(records.some(r=>Array.from(r.addedNodes).some(n=>n.nodeType===1 && (n.matches?.('select')||n.querySelector?.('select')))))scan();}).observe(document.documentElement,{childList:true,subtree:true});
})();
