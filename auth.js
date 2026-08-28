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
      free_chats_used: 0,
      free_chats_limit: 3,
      is_premium: false
    });
    localStorage.removeItem('uncover_profile_draft');
  }

  window.UncoverAuth = {
    getClient,
    getUser,
    ensureProfile,
    async signUp({ email, password, display_name }) {
      const sb = getClient();
      if (!sb) throw new Error('Supabase has not loaded yet. Refresh and try again.');
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: 'https://sanjayhari54.github.io/uncover/login.html' } });
      if (error) throw error;
      localStorage.setItem('uncover_profile_draft', JSON.stringify({ display_name }));
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
