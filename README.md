# BTC LLM Trading Signals — PoC (React Native + Expo)

ملخص
-----
نظام إشارات تداول BTC يستخدم تحليل متعدد-الأطر زمنية + تكامل مع مزودي LLM متعددين.
يدعم إضافة أي مزود LLM بسهولة عن طريق إدخال **مفتاح/مواصفات** (generic provider spec). لا حاجة لتحديد نوع الموفر — فقط أضف spec وسيعمل.

المتطلبات
---------
- Node.js 18+
- Yarn أو npm
- Expo CLI (إذا تستخدم Expo)
- حسابات (مفتاح API) لأي موفر LLM تختاره (اختياري للبدء: يمكن العمل بالـ mocks)

الحزم الأساسية
---------------
yarn add @react-native-async-storage/async-storage expo-secure-store uuid
(في حالة تشغيل في Node لاختبارات: node-fetch)

هيكل المشروع المقترح
--------------------
/app
  /services
    llmService.ts
    multiTimeframeService.ts
    playbookService.ts
    signalService.ts
  /hooks
    useSignalGenerator.ts
  /components
    SignalCard.tsx
    LLMConfigModal.tsx
  /screens
    SignalsScreen.tsx
  utils
    providerStore.ts
README.md

تشغيل المشروع (محلي)
---------------------
1. تثبيت الحزم
   yarn install

2. تشغيل Expo
   yarn expo start

3. افتح التطبيق على المحاكي أو هاتفك باستخدام Expo Go

إضافة مزود LLM جديد (شرح سريع)
-----------------------------
افتح شاشة الإعدادات في التطبيق → Add Provider → أدخل:
- provider id (مثلاً: my-llm-1)
- name (مثلاً: MyCustomLLM)
- endpoint (URL)
- model (اختياري)
- headers JSON (مثلاً: { "Authorization": "Bearer xxxxx" })
- requestTemplate (نموذج JSON كسلسلة مع متغيرات مثل {{prompt}} و{{model}})

بمجرد الحفظ سيُخزن المفتاح بأمان (SecureStore) ومواصفات الموفر في الـ AsyncStorage، ويصبح متاحًا في قائمة الموفرين لاستخدامه فورًا.

أمان
----
- مفاتيح المزود محفوظة في `expo-secure-store`.
- مواصفات المزود (endpoint, headers-keys placeholder) محلية بالـ AsyncStorage.
- لا تُرسل بيانات Playbook أو مفاتيح إلى خادم خارجي من قِبل التطبيق.

توصيات مستقبلية
----------------
- أضف تحقق Schema (zod/io-ts) على `requestTemplate` و `responseMapping`.
- إضافة Circuit Breaker وProvider Health Tracking.
- أتمتة تتبع الـ outcomes عبر ربط Exchange API.
