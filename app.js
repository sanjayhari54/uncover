(function(){
  function toast(msg){let t=document.getElementById('toast');if(t){t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2800)}else alert(msg)}
  window.showLike=function(){toast('Like sent privately. If they also approve, both profiles will be revealed.')};
  window.skipCard=function(){toast('Passed. Finding another conversation…')};
  document.addEventListener('DOMContentLoaded',async()=>{
    if(!window.UncoverAuth) return;
    const path=location.pathname.split('/').pop();
    if(['app.html','chat.html','connections.html','profile.html'].includes(path)){
      const user=await UncoverAuth.getUser();
      if(!user){location.href='login.html';return;}
      const name=user.user_metadata?.display_name || user.email?.split('@')[0] || 'You';
      document.querySelectorAll('[data-user-name]').forEach(el=>el.textContent=name);
      const client=UncoverAuth.getClient();
      if(path==='app.html' && client){
        const {data}=await client.from('profiles').select('free_chats_used,free_chats_limit,is_premium,is_profile_complete').eq('id',user.id).maybeSingle();
        if(data && !data.is_profile_complete){location.href='profile.html';return;}
        if(data){const remaining=Math.max(0,(data.free_chats_limit||3)-(data.free_chats_used||0));document.querySelectorAll('[data-free-remaining]').forEach(el=>el.textContent=remaining);}
      }
    }
    document.querySelectorAll('[data-signout]').forEach(b=>b.addEventListener('click',()=>UncoverAuth.signOut()));
  });
})();
