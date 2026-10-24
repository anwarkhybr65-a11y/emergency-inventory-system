import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

const playSound = (type) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) {
    console.error("Audio API error:", e);
  }
};

const calculateExpiryDays = (expiryDateStr) => {
  if (!expiryDateStr) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDate = new Date(expiryDateStr);
  const diffTime = expiryDate - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const initialInventory = [
  { id: 1, name: 'أدرينالين (Epinephrine Injection)', barcode: '62810001111', batchNo: 'BAT-2026-A', quantity: 5, price: 45.00, expiryDate: '2026-11-04', category: 'أدوية حرجة', status: 'active' },
  { id: 2, name: 'أدرينالين (Epinephrine Injection)', barcode: '62810001111', batchNo: 'BAT-2026-B', quantity: 10, price: 45.00, expiryDate: '2027-04-20', category: 'أدوية حرجة', status: 'active' },
  { id: 3, name: 'أتروبين (Atropine Ampoule)', barcode: '62810002222', batchNo: 'BAT-2026-C', quantity: 4, price: 30.00, expiryDate: '2026-11-07', category: 'أدوية حرجة', status: 'active' },
  { id: 4, name: 'محلول ملحي (Normal Saline 500ml)', barcode: '62810003333', batchNo: 'BAT-2026-D', quantity: 2, price: 15.50, expiryDate: '2027-05-10', category: 'محاليل', status: 'active' },
  { id: 5, name: 'شاش معقم (Sterile Gauze 10x10)', barcode: '62810004444', batchNo: 'BAT-2026-E', quantity: 0, price: 8.00, expiryDate: '2027-10-23', category: 'ضمادات', status: 'active' },
  { id: 6, name: 'إنسولين سريع (Regular Insulin)', barcode: '62810005555', batchNo: 'BAT-2026-F', quantity: 3, price: 85.00, expiryDate: '2026-10-21', category: 'أدوية حرجة', status: 'active' },
  { id: 7, name: 'حقن بلاستيكية 5مل (Syringe 5ml)', barcode: '62810006666', batchNo: 'BAT-2026-G', quantity: 45, price: 2.50, expiryDate: '2028-03-01', category: 'مستلزمات', status: 'active' },
];

const actorLabel = (user) => {
  if (!user) return '';
  return user.role === 'nurse' ? 'ممرضة' : 'مشرف';
};

const INVENTORY_COLUMNS = 'id,name,barcode,batch_no,quantity,price,expiry_date,category,status';
const LOG_COLUMNS = 'id,timestamp,action,details,type';

const toDbItem = (item) => ({
  name: item.name,
  barcode: String(item.barcode ?? ''),
  batch_no: item.batchNo,
  quantity: Number(item.quantity) || 0,
  price: Number(item.price) || 0,
  expiry_date: item.expiryDate,
  category: item.category,
  status: item.status || 'active',
});

const fromDbItem = (row) => ({
  id: row.id,
  name: row.name,
  barcode: row.barcode,
  batchNo: row.batch_no,
  quantity: Number(row.quantity) || 0,
  price: Number(row.price) || 0,
  expiryDate: row.expiry_date,
  category: row.category,
  status: row.status,
});

const toDbLog = (log) => ({
  timestamp: log.timestamp,
  action: log.action,
  details: log.details,
  type: log.type,
});

const fromDbLog = (row) => ({
  id: row.id,
  timestamp: row.timestamp,
  action: row.action,
  details: sanitizeLogDetails(row.details),
  type: row.type,
});

const sanitizeLogDetails = (details) => {
  if (!details) return details;
  return details
    .replaceAll('د. علي الشمري (مشرف)', 'المشرف')
    .replaceAll('الممرضة نورة العتيبي', 'الممرضة')
    .replaceAll('[المستخدم: المشرف]', '[المشرف]')
    .replaceAll('[المستخدم: الممرضة]', '[الممرضة]')
    .replaceAll('دخول المشرف: المشرف', 'دخول المشرف')
    .replaceAll('دخول الكادر التمريضي: الممرضة', 'دخول الممرضة')
    .replaceAll('خروج المستخدم: المشرف', 'خروج المشرف')
    .replaceAll('خروج المستخدم: الممرضة', 'خروج الممرضة');
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const savedUser = localStorage.getItem('emergency_inventory_user');
    if (savedUser) {
      try { return JSON.parse(savedUser); } catch (e) { console.error(e); }
    }
    return null;
  });

  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  const [items, setItems] = useState(() => {
    const savedData = localStorage.getItem('emergency_inventory_data_v2');
    if (savedData) {
      try { return JSON.parse(savedData); } catch (e) { console.error(e); }
    }
    return initialInventory;
  });

  const [logs, setLogs] = useState(() => {
    const savedLogs = localStorage.getItem('emergency_inventory_logs');
    if (savedLogs) {
      try {
        return JSON.parse(savedLogs).map((log) => ({
          ...log,
          details: sanitizeLogDetails(log.details),
        }));
      } catch (e) { console.error(e); }
    }
    return [
      { id: 1, timestamp: new Date().toLocaleString('ar-SA'), action: 'تهيئة النظام', details: 'بدء تشغيل نظام تتبع أدوية الطوارئ بنجاح', type: 'system' }
    ];
  });

  const [logFilter, setLogFilter] = useState('all');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanMode, setScanMode] = useState('dispense');
  const [activeTab, setActiveTab] = useState('all');
  const [message, setMessage] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const [newItem, setNewItem] = useState({
    name: '',
    barcode: '',
    batchNo: '',
    quantity: 10,
    price: 10.00,
    expiryDate: '',
    category: 'أدوية حرجة'
  });

  const barcodeRef = useRef(null);
  const itemsRef = useRef(items);
  const logsRef = useRef(logs);
  const remoteReady = useRef(false);
  const pendingInsert = useRef(new Set());
  const syncQueue = useRef(Promise.resolve());
  itemsRef.current = items;
  logsRef.current = logs;

  useEffect(() => {
    localStorage.setItem('emergency_inventory_data_v2', JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem('emergency_inventory_logs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('emergency_inventory_user', JSON.stringify(currentUser));
      if (currentUser.role === 'nurse') {
        setScanMode('dispense');
      }
    } else {
      localStorage.removeItem('emergency_inventory_user');
    }
  }, [currentUser]);

  useEffect(() => {
    let cancelled = false;

    const loadRemote = async () => {
      const { data: inventoryRows, error: inventoryError } = await supabase
        .from('inventory')
        .select(INVENTORY_COLUMNS)
        .order('id', { ascending: true });

      if (cancelled) return;
      if (inventoryError) {
        console.error(inventoryError);
        return;
      }

      if (inventoryRows.length === 0) {
        const seed = itemsRef.current.map(toDbItem);
        const { data: inserted, error: insertError } = await supabase
          .from('inventory')
          .insert(seed)
          .select(INVENTORY_COLUMNS);
        if (cancelled) return;
        if (insertError) {
          console.error(insertError);
          return;
        }
        remoteReady.current = true;
        setItems((inserted || []).map(fromDbItem));
      } else {
        remoteReady.current = true;
        setItems(inventoryRows.map(fromDbItem));
      }

      const { data: logRows, error: logError } = await supabase
        .from('audit_logs')
        .select(LOG_COLUMNS)
        .order('id', { ascending: false });

      if (cancelled) return;
      if (logError) {
        console.error(logError);
        remoteReady.current = true;
        return;
      }

      if (logRows.length === 0) {
        const seedLogs = logsRef.current.map(toDbLog);
        const { data: insertedLogs, error: insertLogError } = await supabase
          .from('audit_logs')
          .insert(seedLogs)
          .select(LOG_COLUMNS);
        if (cancelled) return;
        if (insertLogError) {
          console.error(insertLogError);
        } else {
          setLogs((insertedLogs || []).map(fromDbLog).sort((a, b) => b.id - a.id));
        }
      } else {
        setLogs(logRows.map(fromDbLog));
      }

      remoteReady.current = true;
    };

    loadRemote();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!remoteReady.current) return;

    const run = async () => {
      const snapshot = itemsRef.current;
      for (const item of snapshot) {
        const current = itemsRef.current.find((row) => row.id === item.id) || item;
        const payload = toDbItem(current);
        const { data: updated, error: updateError } = await supabase
          .from('inventory')
          .update(payload)
          .eq('id', current.id)
          .select('id');

        if (updateError) {
          console.error(updateError);
          continue;
        }

        if (updated && updated.length > 0) continue;
        if (pendingInsert.current.has(current.id)) continue;

        pendingInsert.current.add(current.id);
        const { data: inserted, error: insertError } = await supabase
          .from('inventory')
          .insert(payload)
          .select(INVENTORY_COLUMNS);
        pendingInsert.current.delete(current.id);

        if (insertError) {
          console.error(insertError);
          continue;
        }
        if (inserted?.[0] && inserted[0].id !== current.id) {
          setItems((prev) => prev.map((row) => row.id === current.id ? fromDbItem(inserted[0]) : row));
        }
      }
    };

    syncQueue.current = syncQueue.current.then(run, run);
  }, [items]);

  useEffect(() => {
    if (currentUser && activeTab !== 'reports' && activeTab !== 'logs' && !showAddForm) {
      barcodeRef.current?.focus();
    }
  }, [items, message, activeTab, showAddForm, currentUser]);

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    setLoginError('');

    const username = loginForm.username.trim().toLowerCase();
    const password = loginForm.password.trim();

    if (username === 'supervisor' && password === 'Ss@102938') {
      const user = { name: 'مشرف', role: 'supervisor', id: 'ADM-101' };
      setCurrentUser(user);
      addLog('تسجيل دخول', 'تسجيل دخول', 'system', user);
      playSound('success');
    } else if (username === 'nurse' && password === 'Nn@1234') {
      const user = { name: 'ممرضة', role: 'nurse', id: 'NRS-408' };
      setCurrentUser(user);
      addLog('تسجيل دخول', 'تسجيل دخول', 'system', user);
      playSound('success');
    } else {
      setLoginError('اسم المستخدم أو كلمة المرور غير صحيحة!');
      playSound('error');
    }
  };

  const handleLogout = () => {
    if (currentUser) {
      addLog('تسجيل خروج', 'تسجيل خروج', 'system');
    }
    setCurrentUser(null);
    setLoginForm({ username: '', password: '' });
    setActiveTab('all');
  };

  const addLog = (action, details, type, actor = currentUser) => {
    const label = actorLabel(actor);
    const userString = label ? ` [${label}]` : '';
    const newLogEntry = {
      id: Date.now(),
      timestamp: new Date().toLocaleString('ar-SA'),
      action,
      details: `${details}${userString}`,
      type
    };
    setLogs(prev => [newLogEntry, ...prev]);

    supabase
      .from('audit_logs')
      .insert(toDbLog(newLogEntry))
      .select(LOG_COLUMNS)
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          return;
        }
        if (data?.[0]) {
          setLogs((prev) => prev.map((row) =>
            row.timestamp === newLogEntry.timestamp && row.details === newLogEntry.details && row.action === newLogEntry.action
              ? fromDbLog(data[0])
              : row
          ));
        }
      });
  };

  const activeItems = items.filter(i => i.status === 'active');
  const disposedItems = items.filter(i => i.status === 'disposed');
  
  const validItems = activeItems.filter(i => calculateExpiryDays(i.expiryDate) > 30);
  const nearExpiryItems = activeItems.filter(i => {
    const days = calculateExpiryDays(i.expiryDate);
    return days > 0 && days <= 30;
  });
  const expiredItems = activeItems.filter(i => calculateExpiryDays(i.expiryDate) <= 0);
  const lowStockItems = activeItems.filter(i => i.quantity <= 6 && i.quantity > 0);
  const outOfStockItems = activeItems.filter(i => i.quantity === 0);

  const expiredCount = expiredItems.filter(i => i.quantity > 0).length;
  const nearExpiryCount = nearExpiryItems.filter(i => i.quantity > 0).length;
  const lowStockCount = lowStockItems.length;
  const outOfStockCount = outOfStockItems.length;

  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    const scannedCode = barcodeInput.trim();
    if (!scannedCode) return;

    const matchingBatches = activeItems.filter(i => i.barcode === scannedCode);

    if (matchingBatches.length > 0) {
      if (scanMode === 'dispense' || currentUser?.role === 'nurse') {
        const availableBatches = matchingBatches
          .filter(b => b.quantity > 0 && calculateExpiryDays(b.expiryDate) > 0)
          .sort((a, b) => calculateExpiryDays(a.expiryDate) - calculateExpiryDays(b.expiryDate));

        if (availableBatches.length > 0) {
          const targetBatch = availableBatches[0];
          
          const updated = items.map(item => 
            item.id === targetBatch.id ? { ...item, quantity: item.quantity - 1 } : item
          );
          
          setItems(updated);
          playSound('success');
          const daysLeft = calculateExpiryDays(targetBatch.expiryDate);
          let alertNote = daysLeft <= 30 ? " ⚠️ (صرف تلقائي من الدفعة الأقرب انتهاءً)" : "";
          const msg = `تم صرف عبوة من: ${targetBatch.name} [دفعة: ${targetBatch.batchNo}]${alertNote}`;
          showMessage(msg, 'success');
          addLog('صرف دواء', `صرف 1 عبوة من ${targetBatch.name} (دفعة ${targetBatch.batchNo})`, 'dispense');
        } else {
          playSound('error');
          const expiredMatch = matchingBatches.find(b => b.quantity > 0 && calculateExpiryDays(b.expiryDate) <= 0);
          if (expiredMatch) {
            showMessage(`❌ تنبيه أمني: الدفعة المتبقية من (${expiredMatch.name}) منتهية الصلاحية!`, 'error');
            addLog('تنبيه أمني', `محاولة صرف دواء منتهي الصلاحية: ${expiredMatch.name}`, 'alert');
          } else {
            showMessage(`عذراً، جميع دفعات هذا الدواء نافدة تماماً!`, 'error');
          }
        }
      } else {
        const sortedByNewest = [...matchingBatches].sort((a, b) => calculateExpiryDays(b.expiryDate) - calculateExpiryDays(a.expiryDate));
        const targetBatch = sortedByNewest[0];

        const updated = items.map(item => 
          item.id === targetBatch.id ? { ...item, quantity: item.quantity + 1 } : item
        );

        setItems(updated);
        playSound('success');
        showMessage(`تم زيادة مخزون: ${targetBatch.name} [دفعة: ${targetBatch.batchNo}]`, 'success');
        addLog('إضافة مخزون', `إضافة 1 عبوة لـ ${targetBatch.name} (دفعة ${targetBatch.batchNo})`, 'checkin');
      }
    } else {
      playSound('error');
      showMessage(`الباركود (${scannedCode}) غير مسجل في النظام!`, 'error');
    }

    setBarcodeInput('');
  };

  const handleDispose = (id) => {
    if (currentUser?.role !== 'supervisor') {
      alert("عذراً، صلاحيات الإتلاف مقتصرة على المشرف أو الصيدلي فقط!");
      return;
    }

    const target = items.find(i => i.id === id);
    if (!target) return;

    if (window.confirm(`هل أنتِ متأكدة من إتلاف واستبعاد الدفعة (${target.batchNo}) لـ (${target.name})؟`)) {
      const updated = items.map(i => i.id === id ? { ...i, quantity: 0, status: 'disposed' } : i);
      setItems(updated);
      playSound('success');
      showMessage(`🗑️ تم نقل الدفعة (${target.batchNo}) إلى سجل التالف والمستبعد.`, 'success');
      addLog('إتلاف دواء', `إتلاف واستبعاد دفعة ${target.batchNo} لـ ${target.name}`, 'dispose');
    }
  };

  const handleAddNewItemSubmit = (e) => {
    e.preventDefault();
    if (currentUser?.role !== 'supervisor') {
      alert("عذراً، إضافة أصناف جديدة مقتصرة على المشرف أو الصيدلي فقط!");
      return;
    }

    if (!newItem.name || !newItem.barcode || !newItem.batchNo || !newItem.expiryDate) {
      alert("يرجى ملء جميع الحقول المطلوبة!");
      return;
    }

    const itemToAdd = {
      id: Date.now(),
      name: newItem.name,
      barcode: newItem.barcode.trim(),
      batchNo: newItem.batchNo.trim(),
      quantity: Number(newItem.quantity),
      price: Number(newItem.price) || 0,
      expiryDate: newItem.expiryDate,
      category: newItem.category,
      status: 'active'
    };

    setItems([...items, itemToAdd]);
    setShowAddForm(false);
    playSound('success');
    setNewItem({ name: '', barcode: '', batchNo: '', quantity: 10, price: 10.00, expiryDate: '', category: 'أدوية حرجة' });
    showMessage(`✨ تم إضافة الدواء الجديد (${itemToAdd.name}) بنجاح!`, 'success');
    addLog('تسجيل صنف', `تسجيل شحنة جديدة: ${itemToAdd.name} (كمية ${itemToAdd.quantity}) بسعر ${itemToAdd.price} ر.س`, 'add');
  };

  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const filteredItems = items.filter(item => {
    if (activeTab === 'disposed') return item.status === 'disposed';
    if (item.status !== 'active') return false;
    if (activeTab === 'lowStock') return item.quantity <= 6;
    if (activeTab === 'expiryAlert') return calculateExpiryDays(item.expiryDate) <= 30;
    return true;
  });

  const filteredLogs = logs.filter(log => {
    if (logFilter === 'all') return true;
    return log.type === logFilter;
  });

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-teal-950 to-emerald-950 flex items-center justify-center p-4 font-sans" dir="rtl">
        <div className="max-w-md w-full bg-white/95 backdrop-blur-2xl rounded-3xl p-8 shadow-2xl border border-white/20 space-y-6">
          <div className="text-center space-y-2">
            <img
              src="/logo.png"
              alt="مجمع أنوار خيبر الطبي"
              className="h-20 w-auto mx-auto object-contain"
            />
            <h1 className="text-2xl font-black text-slate-900">تسجيل الدخول للنظام</h1>
            <p className="text-xs text-slate-500 font-semibold">نظام تتبع ورصد أدوية الطوارئ المعتمد</p>
          </div>

          {loginError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-2xl text-xs font-bold text-center">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-700 text-xs font-bold mb-1">اسم المستخدم / الرقم الوظيفي</label>
              <input
                type="text"
                required
                placeholder="أدخلى اسم المستخدم"
                value={loginForm.username}
                onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>

            <div>
              <label className="block text-slate-700 text-xs font-bold mb-1">كلمة المرور</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-black rounded-2xl text-sm shadow-xl shadow-emerald-600/25 transition transform active:scale-95"
            >
              تسجيل الدخول
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-tr from-slate-100 via-teal-50/30 to-emerald-50/40 text-slate-800 p-4 md:p-8 font-sans" dir="rtl">
      
      <style>{`
        .print-only, .print-sign { display: none; }
        @media print {
          @page { size: A4; margin: 12mm; }
          html, body, #root {
            background: #fff !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            color: #000 !important;
          }
          .no-print { display: none !important; }
          .min-h-screen,
          .max-w-7xl,
          .overflow-hidden,
          .backdrop-blur-xl {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            max-width: none !important;
            background: #fff !important;
            box-shadow: none !important;
            border: none !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            position: static !important;
            transform: none !important;
          }
          #printable-report,
          #printable-logs {
            display: block !important;
            position: static !important;
            visibility: visible !important;
            width: 100% !important;
            overflow: visible !important;
            background: #fff !important;
            color: #000 !important;
            padding: 0 !important;
          }
          #printable-report *,
          #printable-logs * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #printable-report table,
          #printable-logs table {
            width: 100% !important;
            border-collapse: collapse !important;
            page-break-inside: auto;
          }
          #printable-report th,
          #printable-report td,
          #printable-logs th,
          #printable-logs td {
            border: 1px solid #333 !important;
            color: #000 !important;
            background: #fff !important;
          }
          #printable-report tr,
          #printable-logs tr,
          #printable-report h2,
          #printable-report h3,
          #printable-logs h2 {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          #printable-report thead,
          #printable-logs thead { display: table-header-group; }
          .print-only { display: block !important; }
          .print-sign {
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            margin-top: 28px;
            text-align: center;
          }
        }
      `}</style>

      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl border border-white/60 shadow-xl shadow-slate-200/50 flex flex-col md:flex-row justify-between items-center gap-4 no-print">
          <div className="flex items-center gap-4">
            <img
              src="/logo.png"
              alt="مجمع أنوار خيبر الطبي"
              className="h-14 w-auto object-contain"
            />
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">نظام متابعة أدوية الطوارئ الذكي</h1>
              <p className="text-xs text-emerald-600 font-semibold mt-0.5">
                المستخدم الحالي: <span className="font-bold text-slate-800">{actorLabel(currentUser)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {currentUser.role === 'supervisor' && (
              <>
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold rounded-2xl text-xs shadow-lg transition flex items-center gap-1.5"
                >
                  <span>{showAddForm ? '✕ إغلاق' : '✨ إضافة صنف'}</span>
                </button>

                <button
                  onClick={() => setActiveTab('logs')}
                  className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-2xl text-xs border border-slate-200/80 shadow-md transition flex items-center gap-1.5"
                >
                  <span>📜 السجل</span>
                </button>

                <button
                  onClick={() => setActiveTab('reports')}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl text-xs shadow-md transition flex items-center gap-1.5"
                >
                  <span>📊 التقارير / PDF</span>
                </button>
              </>
            )}

            <button
              onClick={handleLogout}
              className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-2xl text-xs border border-red-200/80 transition flex items-center gap-1.5"
            >
              <span>🔒 خروج</span>
            </button>
          </div>
        </header>

        {/* نموذج الإضافة للمشرف فقط */}
        {showAddForm && currentUser.role === 'supervisor' && (
          <div className="bg-white/90 backdrop-blur-xl border border-emerald-500/30 p-6 rounded-3xl shadow-2xl space-y-4 no-print animate-in fade-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-emerald-700 flex items-center gap-2">
                <span>💊</span> إضافة صنف أو شحنة دواء جديدة للمخزون (صلاحية مشرف)
              </h3>
              <button onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>

            <form onSubmit={handleAddNewItemSubmit} className="space-y-4 text-xs md:text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">اسم الدواء / المستلزم الطبي *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: أدرينالين (Epinephrine)"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200 rounded-2xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">الفئة الطبية</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200 rounded-2xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                  >
                    <option value="أدوية حرجة">أدوية حرجة</option>
                    <option value="محاليل">محاليل وريدية</option>
                    <option value="ضمادات">ضمادات ومطهرات</option>
                    <option value="مستلزمات">مستلزمات عامة</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">الباركود *</label>
                  <input
                    type="text"
                    required
                    placeholder="امسحي بالقارئ أو اكتبي"
                    value={newItem.barcode}
                    onChange={(e) => setNewItem({ ...newItem, barcode: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200 rounded-2xl text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">رقم الدفعة (Batch) *</label>
                  <input
                    type="text"
                    required
                    placeholder="BAT-2026-X"
                    value={newItem.batchNo}
                    onChange={(e) => setNewItem({ ...newItem, batchNo: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200 rounded-2xl text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">الكمية *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200 rounded-2xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">السعر (ر.س) *</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    value={newItem.price}
                    onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200 rounded-2xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">تاريخ الانتهاء *</label>
                  <input
                    type="date"
                    required
                    value={newItem.expiryDate}
                    onChange={(e) => setNewItem({ ...newItem, expiryDate: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200 rounded-2xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition shadow-lg shadow-emerald-600/20"
                >
                  تأكيد وحفظ الدفعة
                </button>
              </div>
            </form>
          </div>
        )}

        {/* المؤشرات */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 no-print">
          <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-red-100 shadow-xl shadow-red-500/5 hover:-translate-y-1 transition-all duration-300">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">منتهي الصلاحية</span>
              <span className="p-2 rounded-xl bg-red-50 text-red-500 text-sm">🔴</span>
            </div>
            <p className="text-3xl font-black text-red-600 mt-3">{expiredCount}</p>
            <p className="text-[11px] text-red-400 font-semibold mt-1">تستوجب الإتلاف الفوري</p>
          </div>

          <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-amber-100 shadow-xl shadow-amber-500/5 hover:-translate-y-1 transition-all duration-300">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">قريب الانتهاء (≤30)</span>
              <span className="p-2 rounded-xl bg-amber-50 text-amber-500 text-sm">🟠</span>
            </div>
            <p className="text-3xl font-black text-amber-600 mt-3">{nearExpiryCount}</p>
            <p className="text-[11px] text-amber-500 font-semibold mt-1">أولوية الصرف الطبي</p>
          </div>

          <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-yellow-100 shadow-xl shadow-yellow-500/5 hover:-translate-y-1 transition-all duration-300">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">منخفض المخزون (≤6)</span>
              <span className="p-2 rounded-xl bg-yellow-50 text-yellow-600 text-sm">🟡</span>
            </div>
            <p className="text-3xl font-black text-yellow-600 mt-3">{lowStockCount}</p>
            <p className="text-[11px] text-yellow-600 font-semibold mt-1">تنبيه إعادة الطلب</p>
          </div>

          <div className="bg-white/80 backdrop-blur-xl p-5 rounded-3xl border border-slate-100 shadow-xl shadow-slate-500/5 hover:-translate-y-1 transition-all duration-300">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">نافد تماماً (0)</span>
              <span className="p-2 rounded-xl bg-slate-100 text-slate-500 text-sm">⚪</span>
            </div>
            <p className="text-3xl font-black text-slate-700 mt-3">{outOfStockCount}</p>
            <p className="text-[11px] text-slate-400 font-semibold mt-1">غير متوفر بالقسم</p>
          </div>
        </div>

        {/* الكارت الرئيسي */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl shadow-slate-200/60 border border-white/80 overflow-hidden">
          
          {/* تبويبات الفلترة */}
          <div className="p-4 bg-slate-50/60 border-b border-slate-100 flex flex-wrap gap-2 no-print">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-5 py-2.5 rounded-2xl text-xs md:text-sm font-bold transition-all ${
                activeTab === 'all' ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60'
              }`}
            >
              المخزون النشط ({activeItems.length})
            </button>

            <button
              onClick={() => setActiveTab('lowStock')}
              className={`px-5 py-2.5 rounded-2xl text-xs md:text-sm font-bold transition-all ${
                activeTab === 'lowStock' ? 'bg-amber-500 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60'
              }`}
            >
              تنبيه النفاذ ≤6
            </button>

            <button
              onClick={() => setActiveTab('expiryAlert')}
              className={`px-5 py-2.5 rounded-2xl text-xs md:text-sm font-bold transition-all ${
                activeTab === 'expiryAlert' ? 'bg-red-500 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60'
              }`}
            >
              تنبيه الصلاحية (≤30 يوم)
            </button>

            {/* مقتصر على المشرف */}
            {currentUser.role === 'supervisor' && (
              <>
                <button
                  onClick={() => setActiveTab('disposed')}
                  className={`px-5 py-2.5 rounded-2xl text-xs md:text-sm font-bold transition-all ${
                    activeTab === 'disposed' ? 'bg-slate-700 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                  }`}
                >
                  سجل الإتلاف 🗑️ ({disposedItems.length})
                </button>

                <button
                  onClick={() => setActiveTab('logs')}
                  className={`px-5 py-2.5 rounded-2xl text-xs md:text-sm font-bold transition-all ${
                    activeTab === 'logs' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                  }`}
                >
                  📜 سجل الحركات والعمليات
                </button>

                <button
                  onClick={() => setActiveTab('reports')}
                  className={`px-5 py-2.5 rounded-2xl text-xs md:text-sm font-bold transition-all ${
                    activeTab === 'reports' ? 'bg-teal-600 text-white shadow-lg' : 'bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200/60'
                  }`}
                >
                  📋 التقارير وحفظ PDF
                </button>
              </>
            )}
          </div>

          {activeTab === 'logs' && currentUser.role === 'supervisor' ? (
            /* سجل العمليات */
            <div className="p-6 space-y-6 bg-white">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4 no-print">
                <div>
                  <h2 className="text-xl font-black text-slate-900">سجل حركات وعمليات النظام (Audit Trail)</h2>
                  <p className="text-xs text-slate-500 mt-1">تتبع توثيقي لعمليات الصرف والإدخال والإتلاف، ويُذكر الدور فقط: ممرضة أو مشرف</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex gap-1 border p-1 rounded-2xl bg-slate-50">
                    <button onClick={() => setLogFilter('all')} className={`px-3 py-1.5 rounded-xl text-xs font-bold ${logFilter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>الكل</button>
                    <button onClick={() => setLogFilter('dispense')} className={`px-3 py-1.5 rounded-xl text-xs font-bold ${logFilter === 'dispense' ? 'bg-red-600 text-white' : 'text-slate-600'}`}>الصرف</button>
                    <button onClick={() => setLogFilter('checkin')} className={`px-3 py-1.5 rounded-xl text-xs font-bold ${logFilter === 'checkin' ? 'bg-emerald-600 text-white' : 'text-slate-600'}`}>الإدخال</button>
                    <button onClick={() => setLogFilter('dispose')} className={`px-3 py-1.5 rounded-xl text-xs font-bold ${logFilter === 'dispose' ? 'bg-slate-700 text-white' : 'text-slate-600'}`}>الإتلاف</button>
                  </div>

                  <button
                    onClick={() => window.print()}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl text-xs shadow-lg transition flex items-center gap-2"
                  >
                    <span>🖨️</span> طباعة / تصدير السجل PDF
                  </button>
                </div>
              </div>

              <div id="printable-logs" className="space-y-4">
                <div className="print-only text-center border-b pb-4 mb-4">
                  <h2 className="text-2xl font-black text-slate-900">تقرير سجل الحركات والتدقيق الطبي الرسمية</h2>
                  <p className="text-xs text-slate-500 mt-1">تاريخ الاستخراج: {new Date().toLocaleString('ar-SA')} | {actorLabel(currentUser)}</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse text-xs md:text-sm border border-slate-200">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 border-b">
                        <th className="py-3 px-4 border">الوقت والتاريخ</th>
                        <th className="py-3 px-4 border">نوع العملية</th>
                        <th className="py-3 px-4 border">تفاصيل الحركة والمستخدم</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredLogs.map(log => (
                        <tr key={log.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3.5 px-4 font-mono text-slate-500 border">{log.timestamp}</td>
                          <td className="py-3.5 px-4 font-bold border">
                            <span className={`px-2.5 py-1 rounded-lg text-xs ${
                              log.type === 'dispense' ? 'bg-red-50 text-red-600' :
                              log.type === 'checkin' ? 'bg-emerald-50 text-emerald-600' :
                              log.type === 'dispose' ? 'bg-slate-100 text-slate-700' : 'bg-indigo-50 text-indigo-600'
                            }`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-800 border">{log.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="print-sign text-center text-xs text-slate-700 font-semibold border-t mt-12 pt-4">
                  <div>توقيع المشرف الرقابي: .......................</div>
                  <div>اعتماد مدير القسم: .......................</div>
                </div>
              </div>

            </div>
          ) : activeTab === 'reports' && currentUser.role === 'supervisor' ? (
            /* التقارير وحفظ PDF */
            <div className="p-6 space-y-6 bg-white">
              <div className="flex justify-between items-center no-print border-b pb-4">
                <div>
                  <h2 className="text-xl font-black text-slate-900">مركز التقارير الطبية والمخزنية المعتمدة</h2>
                  <p className="text-xs text-slate-500 mt-1">تقارير موثقة بتواريخ انتهاء الصلاحية ورقم التشغيلات جاهزة للحفظ والتصدير</p>
                </div>
                <button
                  onClick={() => window.print()}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl text-xs shadow-lg transition flex items-center gap-2"
                >
                  <span>📥</span> تصدير وحفظ التقرير PDF
                </button>
              </div>

              <div id="printable-report" className="space-y-6 text-slate-800 bg-white p-2">
                <div className="text-center border-b pb-4">
                  <h2 className="text-2xl font-black">تقرير جودة وإدارة أدوية الطوارئ</h2>
                  <p className="text-xs text-slate-500 mt-1">تاريخ الإصدار: {new Date().toLocaleDateString('ar-SA')}</p>
                </div>

                <div className="space-y-2">
                  <h3 className="font-bold text-xs text-emerald-800 bg-emerald-50 p-2 rounded-lg border border-emerald-200">🟢 1. الأدوية والدفعات الصالحة</h3>
                  <table className="w-full text-right border-collapse border border-slate-300 text-xs">
                    <thead>
                      <tr className="bg-slate-100"><th className="p-2 border">الدواء</th><th className="p-2 border">الدفعة</th><th className="p-2 border">الكمية</th><th className="p-2 border">السعر (ر.س)</th><th className="p-2 border">تاريخ الصلاحية</th></tr>
                    </thead>
                    <tbody>
                      {validItems.map(i => (
                        <tr key={i.id}><td className="p-2 border font-semibold">{i.name}</td><td className="p-2 border font-mono">{i.batchNo}</td><td className="p-2 border">{i.quantity} علبة</td><td className="p-2 border font-mono">{i.price ? i.price.toFixed(2) : '0.00'}</td><td className="p-2 border font-mono">{i.expiryDate}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2">
                  <h3 className="font-bold text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">🟠 2. الدفعات قريبة الانتهاء (أولوية الصرف)</h3>
                  <table className="w-full text-right border-collapse border border-slate-300 text-xs">
                    <thead>
                      <tr className="bg-amber-100/70"><th className="p-2 border">الدواء</th><th className="p-2 border">الدفعة</th><th className="p-2 border">الكمية</th><th className="p-2 border">السعر (ر.س)</th><th className="p-2 border">تاريخ الصلاحية</th></tr>
                    </thead>
                    <tbody>
                      {nearExpiryItems.map(i => (
                        <tr key={i.id}><td className="p-2 border font-semibold">{i.name}</td><td className="p-2 border font-mono">{i.batchNo}</td><td className="p-2 border">{i.quantity} علبة</td><td className="p-2 border font-mono">{i.price ? i.price.toFixed(2) : '0.00'}</td><td className="p-2 border font-mono font-bold text-amber-800">{i.expiryDate}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2">
                  <h3 className="font-bold text-xs text-red-800 bg-red-50 p-2 rounded-lg border border-red-200">🗑️ 3. سجل المواد التالفة والمستبعدة رسمياً</h3>
                  <table className="w-full text-right border-collapse border border-slate-300 text-xs">
                    <thead>
                      <tr className="bg-red-100"><th className="p-2 border">الدواء</th><th className="p-2 border">الدفعة</th><th className="p-2 border">الباركود</th><th className="p-2 border">الحالة</th></tr>
                    </thead>
                    <tbody>
                      {disposedItems.map(i => (
                        <tr key={i.id}><td className="p-2 border font-semibold">{i.name}</td><td className="p-2 border font-mono">{i.batchNo}</td><td className="p-2 border font-mono">{i.barcode}</td><td className="p-2 border font-bold text-red-700">تم العزل والإتلاف</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* منصة المسح بالباركود */}
              <div className="p-6 bg-slate-900 text-white">
                <div className="flex flex-col md:flex-row gap-4 items-center">
                  <div className="flex bg-slate-800/80 p-1.5 rounded-2xl w-full md:w-auto border border-slate-700/50">
                    <button
                      type="button"
                      onClick={() => setScanMode('dispense')}
                      className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${
                        scanMode === 'dispense' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      🔴 صرف آمن (FEFO)
                    </button>
                    {/* خيار إدخال المخزون ظاهر فقط للمشرف */}
                    {currentUser.role === 'supervisor' && (
                      <button
                        type="button"
                        onClick={() => setScanMode('checkin')}
                        className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl font-bold text-xs transition-all ${
                          scanMode === 'checkin' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        🟢 إدخال مخزون (Check-in)
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleBarcodeSubmit} className="flex-1 flex gap-2 w-full">
                    <input
                      ref={barcodeRef}
                      type="text"
                      placeholder="امسحي الباركود بالقارئ مباشرة للصرف..."
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      className="w-full px-5 py-3 bg-slate-800/90 border border-slate-700 rounded-2xl text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-400 text-sm transition"
                    />
                    <button type="submit" className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-extrabold rounded-2xl text-xs transition shadow-lg">
                      تنفيذ
                    </button>
                  </form>
                </div>

                {message && (
                  <div className={`mt-3 p-3.5 rounded-2xl text-xs font-bold ${
                    message.type === 'success' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800' : 'bg-red-950/80 text-red-300 border border-red-800'
                  }`}>
                    {message.text}
                  </div>
                )}
              </div>

              {/* جدول المخزون الرئيسي بعمود السعر */}
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs font-bold border-b border-slate-100">
                      <th className="py-4 px-5">اسم الدواء / المستلزم</th>
                      <th className="py-4 px-5">رقم الدفعة (Batch)</th>
                      <th className="py-4 px-5">الباركود</th>
                      <th className="py-4 px-5">الكمية</th>
                      <th className="py-4 px-5">السعر الفردي</th>
                      <th className="py-4 px-5">تاريخ الصلاحية</th>
                      <th className="py-4 px-5">حالة الصلاحية</th>
                      <th className="py-4 px-5 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs md:text-sm">
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="text-center py-10 text-slate-400 font-medium">
                          لا توجد بيانات مسجلة في هذا التبويب حالياً.
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item) => {
                        const daysLeft = calculateExpiryDays(item.expiryDate);

                        let qtyBadgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200/60";
                        if (item.quantity === 0) {
                          qtyBadgeClass = "bg-red-50 text-red-700 border-red-200/60 font-black";
                        } else if (item.quantity <= 6) {
                          qtyBadgeClass = "bg-amber-50 text-amber-700 border-amber-200/60 font-bold";
                        }

                        let expiryBadgeClass = "bg-slate-100 text-slate-600";
                        let expiryText = `${daysLeft} يوم متبقي`;
                        
                        if (item.status === 'disposed') {
                          expiryBadgeClass = "bg-slate-100 text-slate-400 border border-slate-200";
                          expiryText = "🗑️ تم الإتلاف والأرشفة";
                        } else if (daysLeft <= 0) {
                          expiryBadgeClass = "bg-red-50 text-red-600 border border-red-200 font-black animate-pulse";
                          expiryText = "🔴 منتهي الصلاحية!";
                        } else if (daysLeft <= 30) {
                          expiryBadgeClass = "bg-amber-50 text-amber-600 border border-amber-200 font-bold";
                          expiryText = `🟠 ينتهي خلال ${daysLeft} يوم`;
                        }

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/80 transition-all duration-150">
                            <td className="py-4 px-5 font-bold text-slate-800">{item.name}</td>
                            <td className="py-4 px-5 font-mono text-xs text-emerald-600 font-extrabold">{item.batchNo}</td>
                            <td className="py-4 px-5 text-slate-400 font-mono text-xs">{item.barcode}</td>
                            <td className="py-4 px-5">
                              <span className={`inline-block px-3.5 py-1 rounded-full text-xs border ${qtyBadgeClass}`}>
                                {item.quantity} علبة
                              </span>
                            </td>
                            <td className="py-4 px-5 font-mono font-bold text-slate-700">
                              {item.price ? `${item.price.toFixed(2)} ر.س` : '0.00 ر.س'}
                            </td>
                            <td className="py-4 px-5 font-mono font-bold text-slate-700">{item.expiryDate}</td>
                            <td className="py-4 px-5">
                              <span className={`inline-block px-3 py-1 rounded-xl text-xs ${expiryBadgeClass}`}>
                                {expiryText}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-center">
                              {item.status === 'disposed' ? (
                                <span className="text-xs text-slate-400 font-medium">مؤرشف في سجل التالف</span>
                              ) : (
                                <div className="flex justify-center items-center gap-1.5">
                                  {daysLeft <= 0 && item.quantity > 0 ? (
                                    currentUser.role === 'supervisor' ? (
                                      <button
                                        onClick={() => handleDispose(item.id)}
                                        className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-md transition"
                                      >
                                        🗑️ إتلاف / استبعاد
                                      </button>
                                    ) : (
                                      <span className="text-xs text-red-500 font-bold">يتطلب مشرف للإتلاف</span>
                                    )
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => {
                                          if (item.quantity > 0 && daysLeft > 0) {
                                            const updated = items.map(i => i.id === item.id ? { ...i, quantity: i.quantity - 1 } : i);
                                            setItems(updated);
                                            addLog('صرف دواء', `خصم 1 عبوة من ${item.name}`, 'dispense');
                                          } else {
                                            alert("لا يمكن صرف دواء منتهي الصلاحية!");
                                          }
                                        }}
                                        className="px-3.5 py-1.5 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 border border-slate-200/80 rounded-xl text-xs font-bold transition"
                                      >
                                        خصم -
                                      </button>

                                      {/* زر زيادة المخزون محظور تماماً من حساب الممرضة ومتاح للمشرف فقط */}
                                      {currentUser.role === 'supervisor' && (
                                        <button
                                          onClick={() => {
                                            const updated = items.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
                                            setItems(updated);
                                            addLog('إضافة مخزون', `إضافة 1 عبوة لـ ${item.name}`, 'checkin');
                                          }}
                                          className="px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-600 border border-slate-200/80 rounded-xl text-xs font-bold transition"
                                        >
                                          إضافة +
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

        </div>

      </div>
    </div>
  );
}