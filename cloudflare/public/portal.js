(() => {
    const email = document.getElementById('accountEmail');
    const expiry = document.getElementById('sessionExpiry');
    const logout = document.getElementById('logoutButton');

    const loadSession = async () => {
        const response = await fetch('/_portal/auth/session', { headers: { accept: 'application/json' } });
        if (!response.ok) {
            location.replace('/signin?next=%2Fportal');
            return;
        }
        const session = await response.json();
        email.textContent = session.email;
        const remaining = Math.max(0, new Date(session.expiresAt).getTime() - Date.now());
        const days = Math.ceil(remaining / 86400000);
        expiry.textContent = days > 1 ? `${days} 天` : '不到 1 天';
    };

    logout.addEventListener('click', async () => {
        logout.disabled = true;
        try {
            await fetch('/_portal/auth/logout', { method: 'POST' });
        } finally {
            location.replace('/signin');
        }
    });

    loadSession().catch(() => location.replace('/signin?next=%2Fportal'));
})();
