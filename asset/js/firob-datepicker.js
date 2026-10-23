/* ==========================================================================
   FirOb — Unified Datepicker Auto-Initializer (طبقة النموذج الأولي فقط)
   --------------------------------------------------------------------------
   يبحث هذا الملف تلقائيًا عن كل input[type="date"] في الصفحة — بما فيها
   تلك التي تُضاف لاحقًا داخل نوافذ Alpine المنبثقة (template x-if) — ويطبّق
   عليها تقويم Flatpickr المخصَّص (asset/css/firob-datepicker.css) بدل
   الفتح الأصلي (native popup) الذي لا يمكن إعادة تصميمه عبر المتصفحات.

   قرار تصميم مقصود: على الأجهزة اللمسية (pointer: coarse) يبقى الحقل
   الأصلي input[type="date"] كما هو — منتقي التاريخ الأصلي للنظام هناك
   أفضل من أي تقويم مخصَّص (أهداف لمس أكبر، تكامل مع لوحة المفاتيح/النظام).
   التقويم المخصَّص يُفعَّل فقط على أجهزة الفأرة الدقيقة، حيث يبرز الفارق
   البصري بين المتصفحات بوضوح.

   هذا الملف يخص النموذج الأولي الثابت فقط، ويُحذف عند الانتقال إلى
   Laravel (حيث يصبح جزءًا من حزمة Vite الحقيقية مع @layer components).
   ========================================================================== */
(function (w, d) {
  'use strict';

  if (!w.flatpickr) return; // تحميل Flatpickr فشل/محجوب — يبقى الحقل الأصلي مع تنسيق CSS الأساسي فقط

  var SELECTOR = 'input[type="date"]';
  var TRACKED_SELECTOR = 'input[data-fp-init]'; // Flatpickr يحوّل type إلى "hidden" بعد التفعيل، فلا يصلح SELECTOR لاكتشاف الحذف
  var tracked = []; // { original, instance } لكل حقل تم تفعيله عبر Flatpickr

  function isCoarsePointer() {
    try { return w.matchMedia('(pointer: coarse)').matches; }
    catch (e) { return false; }
  }

  function isArabic() {
    return (d.documentElement.lang || 'ar').toLowerCase().indexOf('ar') === 0;
  }

  /** يرسل input/change حقيقيين على العنصر الأصلي ليبقى Alpine x-model متزامنًا */
  function syncOriginal(original, value) {
    if (original.value !== value) original.value = value;
    original.dispatchEvent(new Event('input', { bubbles: true }));
    original.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function buildConfig(original) {
    var ar = isArabic();
    return {
      locale: ar ? 'ar' : 'default',
      dateFormat: 'Y-m-d',
      altInput: true,
      altInputClass: original.className,
      altFormat: ar ? 'j F Y' : 'F j, Y',
      disableMobile: true,
      onReady: function (selectedDates, dateStr, instance) {
        instance.calendarContainer.classList.add('firob-datepicker');

        // نقل الهوية والاتجاه والتلميح إلى الحقل البديل المرئي حتى تبقى
        // التسمية <label for> تشير إلى الحقل الصحيح (required يُنسخ تلقائيًا من Flatpickr)
        var altEl = instance.altInput;
        if (altEl) {
          if (original.id) { altEl.id = original.id; original.removeAttribute('id'); }
          altEl.setAttribute('dir', original.getAttribute('dir') || (ar ? 'rtl' : 'ltr'));
          altEl.setAttribute('autocomplete', 'off');
          if (original.hasAttribute('title')) altEl.setAttribute('title', original.getAttribute('title'));
        }
      },
      onChange: function (selectedDates, dateStr, instance) {
        syncOriginal(instance.input, dateStr);
      }
    };
  }

  function attach(input) {
    if (!input || input.dataset.fpInit) return;
    input.dataset.fpInit = '1';
    input.classList.add('firob-datepicker-input');

    if (isCoarsePointer()) return; // يبقى منتقي النظام الأصلي على اللمس

    var instance = w.flatpickr(input, buildConfig(input));
    tracked.push({ original: input, instance: instance });
  }

  function detach(input) {
    var idx = -1;
    for (var i = 0; i < tracked.length; i++) {
      if (tracked[i].original === input) { idx = i; break; }
    }
    if (idx === -1) return;
    try { tracked[idx].instance.destroy(); } catch (e) {}
    tracked.splice(idx, 1);
  }

  /** إعادة بناء كل التقاويم النشطة بلغة/اتجاه جديدين بعد تبديل اللغة */
  function relocalizeAll() {
    tracked.slice().forEach(function (entry) {
      var input = entry.original;
      try { entry.instance.destroy(); } catch (e) {}
      var idx = tracked.indexOf(entry);
      if (idx > -1) tracked.splice(idx, 1);
      var fresh = w.flatpickr(input, buildConfig(input));
      tracked.push({ original: input, instance: fresh });
    });
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches(SELECTOR)) attach(root);
    var list = root.querySelectorAll ? root.querySelectorAll(SELECTOR) : [];
    for (var i = 0; i < list.length; i++) attach(list[i]);
  }

  function scanRemoved(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches(TRACKED_SELECTOR)) detach(root);
    var list = root.querySelectorAll ? root.querySelectorAll(TRACKED_SELECTOR) : [];
    for (var i = 0; i < list.length; i++) detach(list[i]);
  }

  /* ---------- مراقبة النوافذ المنبثقة (template x-if) التي تُنشئ حقول تاريخ جديدة ---------- */
  var domObserver = new MutationObserver(function (mutations) {
    for (var m = 0; m < mutations.length; m++) {
      var added = mutations[m].addedNodes, removed = mutations[m].removedNodes;
      for (var a = 0; a < added.length; a++) scan(added[a]);
      for (var r = 0; r < removed.length; r++) scanRemoved(removed[r]);
    }
  });

  /* ---------- مراقبة تبديل اللغة/الاتجاه (lang/dir على <html>) ---------- */
  var langObserver = new MutationObserver(function () { relocalizeAll(); });

  function init() {
    scan(d.body);
    domObserver.observe(d.body, { childList: true, subtree: true });
    langObserver.observe(d.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init);
  else init();
})(window, document);
