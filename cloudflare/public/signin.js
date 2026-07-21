(() => {
    const form = document.getElementById('signinForm');
    const email = document.getElementById('email');
    const password = document.getElementById('password');
    const error = document.getElementById('formError');
    const toggle = document.getElementById('togglePassword');
    const submit = form.querySelector('button[type="submit"]');

    const safeNext = () => {
        const value = new URLSearchParams(location.search).get('next');
        if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/signin')) return '/portal';
        return value;
    };

    const showError = (message) => {
        error.textContent = message;
        error.classList.toggle('visible', Boolean(message));
    };

    toggle.addEventListener('click', () => {
        const reveal = password.type === 'password';
        password.type = reveal ? 'text' : 'password';
        toggle.textContent = reveal ? '隐藏' : '显示';
        toggle.setAttribute('aria-label', reveal ? '隐藏密码' : '显示密码');
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        showError('');
        if (!email.validity.valid || !password.value) {
            showError('请输入有效邮箱和密码。');
            (email.validity.valid ? password : email).focus();
            return;
        }
        submit.disabled = true;
        submit.classList.add('loading');
        try {
            const response = await fetch('/_portal/auth/login', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: email.value, password: password.value }),
            });
            const result = await response.json().catch(() => ({}));
            password.value = '';
            if (!response.ok) {
                if (response.status === 429) {
                    const seconds = Number(result.retryAfterSeconds || response.headers.get('retry-after') || 900);
                    showError(`尝试次数过多，请在约 ${Math.max(1, Math.ceil(seconds / 60))} 分钟后重试。`);
                } else if (response.status === 503) {
                    showError('登录服务暂时不可用，请稍后再试。');
                } else {
                    showError('邮箱或密码不正确。');
                }
                password.focus();
                return;
            }
            location.replace(safeNext());
        } catch {
            showError('无法连接登录服务，请检查网络后重试。');
        } finally {
            submit.disabled = false;
            submit.classList.remove('loading');
        }
    });

    fetch('/_portal/auth/session', { headers: { accept: 'application/json' } })
        .then((response) => { if (response.ok) location.replace(safeNext()); })
        .catch(() => {});
})();
