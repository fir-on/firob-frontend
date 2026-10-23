/* ==========================================================================
   FirOb — Prototype Runtime (طبقة العرض التجريبي فقط)
   --------------------------------------------------------------------------
   هذا الملف يخص النموذج الأولي الثابت (HTML) فقط، ويُحذف بالكامل عند
   الانتقال إلى Laravel — حيث تتكفّل route() و redirect() و App::setLocale()
   بكل ما يفعله هنا.

   يوفّر:
   ① خريطة مسارات واحدة (ROUTES) تُشتق منها كل الروابط تلقائيًا.
   ② ترجمة مسارات Laravel (‎/login‎، ‎/dashboard‎ …) إلى ملفات .html نسبية،
      فتبقى الروابط الحالية في الصفحات تعمل كما هي دون تعديل.
   ③ تثبيت اللغة (ar/en) بين الصفحات — يمنع «القفزة البصرية» عند التنقّل.
   ④ FIROB.go() للتحويل المتأخّر بعد حالة التحميل الوهمية.
   ========================================================================== */
(function (w, d) {
  'use strict';

  /* ---------- ① خريطة الشاشات: الاسم المنطقي ← الملف ---------- */
  var ROUTES = {
    home:                'index.html',
    login:               'auth/login.html',
    register:            'auth/register.html',
    'forgot-password':   'auth/forgot-password.html',
    'reset-password':    'auth/reset-password.html',
    'verify-email':      'auth/verify-email.html',
    'two-factor':        'auth/two-factor.html',
    'accept-invitation': 'auth/accept-invitation.html',
    onboarding:          'auth/onboarding.html',
    dashboard:           'tenant-admin/TenantDashboard.html',
    'super-admin':       'super-admin/overview.html',
    'tenant-courses':    'tenant-admin/CoursesManagement.html',
    'teacher-dashboard': 'teacher/teacher-dashboard.html',
    'student-dashboard': 'student/student-dashboard.html',
    'public-catalog':    'firob-landing.html',
    tenants:             'super-admin/tenants.html',
    plans:               'super-admin/plans.html',
    subscriptions:       'super-admin/subscriptions.html',
    payments:            'super-admin/payments.html',
    'activity-log':      'super-admin/activity-log.html',
    'ai-analytics':      'super-admin/ai-analytics.html',
    'system-settings':   'super-admin/system-settings.html',
    'style-guide':       'style-guide.html',
    profile:             'common/profile.html'
  };

  /* ---------- ② مسارات Laravel ← اسم الشاشة ---------- */
  var ALIASES = {
    '/':                       'home',
    '/login':                  'login',
    '/logout':                 'login',
    '/register':               'register',
    '/forgot-password':        'forgot-password',
    '/reset-password':         'reset-password',
    '/email/verify':           'verify-email',
    '/email/verification-notification': 'verify-email',
    '/two-factor-challenge':   'two-factor',
    '/invitations/accept':     'accept-invitation',
    '/onboarding':             'onboarding',
    '/dashboard':              'dashboard',
    '/admin':                  'super-admin',
    '/admin/tenants':          'tenants',
    '/admin/plans':            'plans',
    '/admin/subscriptions':    'subscriptions',
    '/admin/payments':         'payments',
    '/admin/activity-log':     'activity-log',
    '/admin/ai-analytics':     'ai-analytics',
    '/admin/settings':         'system-settings'
  };

  /* ---------- جذر المشروع مشتقّ من مسار هذا الملف نفسه ----------
     يعمل مع file:// و http:// وأي عمق مجلدات، دون ../../ يدوية. */
  var self = d.currentScript || (function () {
    var s = d.getElementsByTagName('script');
    return s[s.length - 1];
  })();
  var ROOT = (self && self.src ? self.src : '').replace(/asset\/js\/[^\/]*$/, '');

  /* ---------- اللغة ---------- */
  var LOCALE_KEY = 'firob-locale';
  var THEME_KEY  = 'firob-theme';

  function readLocale() {
    try { return localStorage.getItem(LOCALE_KEY) === 'en' ? 'en' : 'ar'; }
    catch (e) { return 'ar'; }
  }
  function writeLocale(loc) {
    try { localStorage.setItem(LOCALE_KEY, loc === 'en' ? 'en' : 'ar'); } catch (e) {}
  }
  function applyLocale(loc) {
    d.documentElement.lang = loc;
    d.documentElement.dir  = loc === 'ar' ? 'rtl' : 'ltr';
  }

  /* صفحة أحادية اللغة (لم تُترجم بعد) تضع data-locale-lock="ar" على <html>
     فلا نفرض عليها اتجاهًا لاتينيًا لمجرد أن المستخدم اختار EN في شاشة سابقة. */
  var LOCK = d.documentElement.getAttribute('data-locale-lock');

  /* يُنفَّذ فورًا (السكربت في <head>) فلا يحدث ارتداد اتجاه عند فتح الصفحة */
  var LOCALE = LOCK || readLocale();
  applyLocale(LOCALE);

  /* ---------- الواجهة العامة ---------- */
  var FIROB = {
    routes: ROUTES,
    root: ROOT,

    /** الرابط الكامل لشاشة: FIROB.url('login') */
    url: function (name) {
      if (!name) return ROOT;
      if (/^(https?:|mailto:|tel:|#)/.test(name)) return name;       // روابط خارجية كما هي
      var key = name.charAt(0) === '/' ? ALIASES[name.replace(/\/+$/, '') || '/'] : name;
      return ROOT + (ROUTES[key] || ROUTES[name] || name.replace(/^\//, ''));
    },

    /** تحويل فوري أو بعد مهلة: FIROB.go('dashboard', 600) */
    go: function (name, delay) {
      var href = FIROB.url(name);
      if (!delay) { w.location.href = href; return; }
      setTimeout(function () { w.location.href = href; }, delay);
    },

    /* --- اللغة --- */
    get locale() { return LOCALE; },
    setLocale: function (loc) {
      LOCALE = loc === 'en' ? 'en' : 'ar';
      writeLocale(LOCALE);
      if (!LOCK) applyLocale(LOCALE);
      return LOCALE;
    },

    /* --- الثيم (للصفحات التي تحتاجه برمجيًا) --- */
    setTheme: function (dark) {
      d.documentElement.classList.toggle('dark', !!dark);
      try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch (e) {}
      var m = d.getElementById('theme-color');
      if (m) m.setAttribute('content', dark ? '#09141B' : '#F1EDE7');
    }
  };

  /* ---------- إعادة كتابة الروابط بعد تحميل DOM ----------
     ‎<a href="/login">‎      → ‎auth/login.html‎
     ‎<a data-go="dashboard">‎ → ينتقل عند النقر (يصلح للأزرار أيضًا) */
  function wire() {
    var i, el, list;

    list = d.querySelectorAll('a[href^="/"]');
    for (i = 0; i < list.length; i++) {
      el = list[i];
      var raw = el.getAttribute('href').replace(/\/+$/, '') || '/';
      if (ALIASES[raw]) el.setAttribute('href', FIROB.url(raw));
    }

    list = d.querySelectorAll('[data-go]');
    for (i = 0; i < list.length; i++) {
      el = list[i];
      var target = el.getAttribute('data-go');
      if (el.tagName === 'A') { el.setAttribute('href', FIROB.url(target)); continue; }
      el.style.cursor = 'pointer';
      el.addEventListener('click', (function (t) {
        return function (ev) { ev.preventDefault(); FIROB.go(t); };
      })(target));
    }
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', wire);
  else wire();

  w.FIROB = FIROB;
})(window, document);
