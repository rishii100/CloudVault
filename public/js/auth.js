// Auth page logic
(function () {
    const API = '/api/auth';

    // Redirect if already logged in
    if (localStorage.getItem('token')) {
        window.location.href = '/dashboard';
        return;
    }

    // Tab switching
    const tabs = document.querySelectorAll('.auth-tab');
    const forms = document.querySelectorAll('.auth-form');
    const alertEl = document.getElementById('alert');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            forms.forEach(f => f.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(target + '-form').classList.add('active');
            hideAlert();
        });
    });

    function showAlert(msg, type = 'error') {
        alertEl.textContent = msg;
        alertEl.className = `alert alert-${type}`;
        alertEl.style.display = 'block';
    }

    function hideAlert() {
        alertEl.style.display = 'none';
    }

    // Login
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAlert();
        const btn = document.getElementById('login-btn');
        btn.disabled = true;
        btn.textContent = 'Logging in...';

        try {
            const res = await fetch(`${API}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: document.getElementById('login-email').value,
                    password: document.getElementById('login-password').value,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            localStorage.setItem('token', data.token);
            localStorage.setItem('email', data.user.email);
            window.location.href = '/dashboard';
        } catch (err) {
            showAlert(err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Log In';
        }
    });

    // Signup
    document.getElementById('signup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAlert();
        const btn = document.getElementById('signup-btn');
        const password = document.getElementById('signup-password').value;
        const confirm = document.getElementById('signup-confirm').value;

        if (password !== confirm) {
            showAlert('Passwords do not match');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Creating account...';

        try {
            const res = await fetch(`${API}/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: document.getElementById('signup-email').value,
                    password,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            localStorage.setItem('token', data.token);
            localStorage.setItem('email', data.user.email);
            window.location.href = '/dashboard';
        } catch (err) {
            showAlert(err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Create Account';
        }
    });
})();
