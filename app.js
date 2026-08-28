(function(){
  function toast(msg){let t=document.getElementById('toast');if(t){t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000)}else alert(msg)}
  window.showLike=async function(otherId){
    const sb=window.UncoverAuth?.getClient(); const user=await window.UncoverAuth?.getUser();
    if(!sb||!user||!otherId){toast('Please sign in first.');return;}
    const {data,error}=await sb.rpc('approve_connection',{p_other_user:otherId});
    if(error){toast(error.message);return;}
    toast(data?'You both approved — the profile can now be revealed.':'Connection request sent privately.');
    if(data) setTimeout(()=>location.href='connections.html',500);
  };
  window.skipCard=function(){toast('Passed. Finding another conversation…'); const c=document.querySelector('.discover-card[data-id]'); if(c)c.remove();};

  async function loadDiscover(){
    const sb=window.UncoverAuth?.getClient(); if(!sb)return;
    const grid=document.getElementById('discoverList'); const empty=document.getElementById('discoverEmpty');
    if(!grid)return;
    grid.innerHTML='<div class="loading-card">Finding thoughtful conversations…</div>';
    const {data,error}=await sb.rpc('discover_people',{p_limit:12});
    if(error){grid.innerHTML='<div class="loading-card">Could not load Discover: '+escapeHtml(error.message)+'</div>';return;}
    if(!data?.length){grid.innerHTML=''; if(empty)empty.hidden=false; return;}
    grid.innerHTML=data.map(person=>{
      const chips=(person.interests||[]).slice(0,4).map(x=>`<span>${escapeHtml(x)}</span>`).join('');
      return `<article class="discover-card" data-id="${person.user_id}"><div class="anonymous-orb small">?</div><div class="profile-meta"><span class="online-dot">● Private</span><span>${escapeHtml(person.age||'Adult')} · ${escapeHtml(person.location||'Nearby')}</span></div><h2>Someone</h2><p>${escapeHtml(person.bio||'They are open to a thoughtful conversation.')}</p><div class="chips">${chips}</div><div class="card-actions"><button class="ghost" onclick="skipCard()">Pass</button><button class="primary" onclick="startChat('${person.user_id}')">Start private chat →</button></div><div class="privacy-note">🔒 Name and photo remain hidden until mutual approval.</div></article>`;
    }).join('');
  }
  function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  window.startChat=async function(otherId){
    const sb=window.UncoverAuth?.getClient(); if(!sb)return;
    const {data,error}=await sb.rpc('start_private_chat',{p_other_user:otherId});
    if(error){
      if(error.message==='FREE_CHAT_LIMIT_REACHED'){location.href='pricing.html';return;}
      toast(error.message);return;
    }
    location.href='chat.html?conversation='+encodeURIComponent(data)+'&other='+encodeURIComponent(otherId);
  };

  async function loadChat(){
    const sb=window.UncoverAuth?.getClient(); const user=await window.UncoverAuth?.getUser();
    const id=new URLSearchParams(location.search).get('conversation');
    const list=document.getElementById('messages'); if(!sb||!user||!list||!id)return;
    const {data,error}=await sb.from('messages').select('id,sender_id,message,created_at').eq('conversation_id',id).order('created_at',{ascending:true});
    if(error){list.innerHTML='<div class="loading-card">'+escapeHtml(error.message)+'</div>';return;}
    list.innerHTML=(data||[]).map(m=>`<div class="bubble ${m.sender_id===user.id?'me':'them'}">${escapeHtml(m.message)}</div>`).join('')||'<div class="empty-chat">Start with a thoughtful question.</div>';
    list.scrollTop=list.scrollHeight;
    const form=document.getElementById('chatForm'), input=document.getElementById('messageInput');
    if(form&&!form.dataset.bound){
      form.dataset.bound='1';form.addEventListener('submit',async e=>{e.preventDefault();const text=input.value.trim();if(!text)return;input.value='';const {error}=await sb.from('messages').insert({conversation_id:id,sender_id:user.id,message:text});if(error){toast(error.message);input.value=text;}});
    }
    if(sb.channel){
      const channel=sb.channel('chat-'+id).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:'conversation_id=eq.'+id},payload=>{
        const m=payload.new;if(document.querySelector(`[data-message-id="${m.id}"]`))return;const el=document.createElement('div');el.className='bubble '+(m.sender_id===user.id?'me':'them');el.dataset.messageId=m.id;el.textContent=m.message;list.appendChild(el);list.scrollTop=list.scrollHeight;
      });channel.subscribe();
    }
  }

  async function loadConnections(){
    const sb=window.UncoverAuth?.getClient(); const grid=document.getElementById('connectionsList'); if(!sb||!grid)return;
    const {data,error}=await sb.rpc('my_connections');
    if(error){grid.innerHTML='<div class="loading-card">'+escapeHtml(error.message)+'</div>';return;}
    if(!data?.length){grid.innerHTML='<div class="loading-card">No connection requests yet. Start a private conversation from Discover.</div>';return;}
    grid.innerHTML='';
    for(const r of data){
      let profile=null;if(r.revealed){const x=await sb.rpc('get_revealed_profile',{p_other_user:r.other_user_id});profile=x.data?.[0]||null;}
      const card=document.createElement('article');card.className='connection-card '+(r.revealed?'reveal':'pending');
      if(r.revealed&&profile){card.innerHTML=`<div class="reveal-avatar">${escapeHtml((profile.display_name||'U').charAt(0).toUpperCase())}</div><div><strong>${escapeHtml(profile.display_name||'Connected')}</strong><p>${escapeHtml(profile.bio||'Your profiles are mutually revealed.')}</p><span class="status">Mutual approval complete · ${escapeHtml(profile.location||'')}</span></div>`;}
      else if(r.is_incoming&&!r.receiver_approved){card.innerHTML=`<span class="mini-orb">?</span><div><strong>Someone</strong><p>They want to connect after your conversation.</p><button class="primary" onclick="approve('${r.other_user_id}')">Approve connection</button></div>`;}
      else card.innerHTML=`<span class="mini-orb">?</span><div><strong>Someone</strong><p>${r.sender_approved?'You've approved this connection.':'Connection request pending.'}</p><span class="status">Profile remains hidden</span></div>`;
      grid.appendChild(card);
    }
  }
  window.approve=async function(other){const sb=window.UncoverAuth?.getClient();if(!sb)return;const {data,error}=await sb.rpc('approve_connection',{p_other_user:other});if(error){toast(error.message);return;}toast(data?'Mutual approval complete. Profile revealed.':'Approved. Waiting for their approval.');setTimeout(loadConnections,400);};

  document.addEventListener('DOMContentLoaded',async()=>{
    if(!window.UncoverAuth)return;
    const path=location.pathname.split('/').pop();
    const protectedPages=['app.html','chat.html','connections.html','profile.html'];
    if(protectedPages.includes(path)){
      const user=await UncoverAuth.getUser();if(!user){location.href='login.html';return;}
      const client=UncoverAuth.getClient();
      if(client&&path==='app.html'){
        const {data}=await client.from('profiles').select('free_chats_used,free_chats_limit,is_premium,is_profile_complete').eq('id',user.id).maybeSingle();
        if(data&&!data.is_profile_complete){location.href='profile.html';return;}
        if(data){const remaining=Math.max(0,(data.free_chats_limit||3)-(data.free_chats_used||0));document.querySelectorAll('[data-free-remaining]').forEach(el=>el.textContent=remaining);}
        loadDiscover();
      }
      if(path==='chat.html')loadChat();
      if(path==='connections.html')loadConnections();
      document.querySelectorAll('[data-user-name]').forEach(el=>el.textContent=user.user_metadata?.display_name||user.email?.split('@')[0]||'You');
    }
    document.querySelectorAll('[data-signout]').forEach(b=>b.addEventListener('click',()=>UncoverAuth.signOut()));
  });
})();
