(function () {
  const SUPABASE_URL = window.SUPABASE_URL;
  const SUPABASE_KEY = window.SUPABASE_PUBLISHABLE_KEY;
  let client = null;

  function getClient() {
    if (!client && window.supabase && SUPABASE_URL && SUPABASE_KEY) {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return client;
  }

  async function getUser() {
    const sb = getClient();
    if (!sb) return null;
    const { data } = await sb.auth.getUser();
    return data?.user || null;
  }

  async function ensureProfile(user) {
    const sb = getClient();
    if (!sb || !user) return;
    const { data: existing } = await sb.from('profiles').select('id').eq('id', user.id).maybeSingle();
    if (existing) return;
    let draft = {};
    try { draft = JSON.parse(localStorage.getItem('uncover_profile_draft') || '{}'); } catch (_) {}
    await sb.from('profiles').insert({
      id: user.id,
      display_name: draft.display_name || user.email?.split('@')[0] || 'Uncover member',
      age: draft.age ? Number(draft.age) : null,
      gender: draft.gender || null,
      location: draft.location || null,
      bio: draft.bio || null,
      interests: Array.isArray(draft.interests) ? draft.interests : [],
      looking_for: Array.isArray(draft.looking_for) ? draft.looking_for : [],
      anon_emoji: ANON_EMOJIS.includes(draft.anon_emoji) ? draft.anon_emoji : randomEmoji()
      // free_chats_used, free_chats_limit and is_premium come from database
      // defaults and cannot be written from the browser.
    });
    localStorage.removeItem('uncover_profile_draft');
  }

  const ANON_EMOJIS = ['🦊','🐼','🐨','🦁','🐯','🐸','🐵','🦉','🦄','🐙','🐳','🦋','🌸','🌙','⭐','🔥','🌈','🍀','🎧','🎨','📚','☕','🌊','🌻'];
  const randomEmoji = () => ANON_EMOJIS[Math.floor(Math.random() * ANON_EMOJIS.length)];
  function renderEmojiPicker(el, selected) {
    if (!el) return () => selected;
    el.innerHTML = ANON_EMOJIS.map(e => '<label class="emoji-opt"><input type="radio" name="anonEmoji" value="' + e + '"' + (e === selected ? ' checked' : '') + '><span>' + e + '</span></label>').join('');
    return () => (el.querySelector('input:checked') || {}).value || selected;
  }

  window.UncoverAuth = {
    ANON_EMOJIS, randomEmoji, renderEmojiPicker,
    getClient,
    getUser,
    ensureProfile,
    async signUp({ email, password, display_name, anon_emoji }) {
      const sb = getClient();
      if (!sb) throw new Error('Supabase has not loaded yet. Refresh and try again.');
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + window.location.pathname.replace(/[^/]+$/, 'login.html'), data: { accepted_terms_at: new Date().toISOString(), display_name, anon_emoji } } });
      if (error) throw error;
      localStorage.setItem('uncover_profile_draft', JSON.stringify({ display_name, anon_emoji }));
      if (data.user && data.session) await ensureProfile(data.user);
      return data;
    },
    async signIn(email, password) {
      const sb = getClient();
      if (!sb) throw new Error('Supabase has not loaded yet. Refresh and try again.');
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await ensureProfile(data.user);
      return data;
    },
    async signOut() {
      const sb = getClient();
      if (sb) await sb.auth.signOut();
      window.location.href = 'index.html';
    }
  };
})();
