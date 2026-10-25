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
  { id: 1, name: 'أدرينالين (Epinephrine Injection)', barcode: '62810001111', batchNo: 'BAT-2026-A', quantity: 5, price: 45.00, expiryDate: '2026-11-04', category: 'أدوية', status: 'active' },
  { id: 2, name: 'أدرينالين (Epinephrine Injection)', barcode: '62810001111', batchNo: 'BAT-2026-B', quantity: 10, price: 45.00, expiryDate: '2027-04-20', category: 'أدوية', status: 'active' },
  { id: 3, name: 'أتروبين (Atropine Ampoule)', barcode: '62810002222', batchNo: 'BAT-2026-C', quantity: 4, price: 30.00, expiryDate: '2026-11-07', category: 'أدوية', status: 'active' },
  { id: 4, name: 'محلول ملحي (Normal Saline 500ml)', barcode: '62810003333', batchNo: 'BAT-2026-D', quantity: 2, price: 15.50, expiryDate: '2027-05-10', category: 'محاليل', status: 'active' },
  { id: 5, name: 'شاش معقم (Sterile Gauze 10x10)', barcode: '62810004444', batchNo: 'BAT-2026-E', quantity: 0, price: 8.00, expiryDate: '2027-10-23', category: 'ضمادات', status: 'active' },
  { id: 6, name: 'إنسولين سريع (Regular Insulin)', barcode: '62810005555', batchNo: 'BAT-2026-F', quantity: 3, price: 85.00, expiryDate: '2026-10-21', category: 'أدوية', status: 'active' },
  { id: 7, name: 'حقن بلاستيكية 5مل (Syringe 5ml)', barcode: '62810006666', batchNo: 'BAT-2026-G', quantity: 45, price: 2.50, expiryDate: '2028-03-01', category: 'مستلزمات', status: 'active' },
];

const actorLabel = (user) => {
  if (!user) return '';
  if (user.role === 'nurse') return 'ممرضة';
  if (user.role === 'data_entry') return 'مدخل البيانات';
  return 'مشرف';
};

const dispenserLabel = (user, nurseProfiles = []) => {
  if (!user) return '—';
  if (user.role !== 'nurse') return actorLabel(user) || '—';
  const savedName = nurseProfiles.find((row) => row.username === user.id)?.full_name?.trim();
  const name = savedName || (user.name && user.name !== 'ممرضة' ? user.name.trim() : '');
  return name ? `الممرضة ${name}` : 'ممرضة';
};

const formatDispenser = (value) => {
  const text = String(value || '').replace(/\s*—\s*ممرضة\s*$/, '').trim();
  if (!text || text === '—') return '—';
  if (text === 'مشرف' || text === 'مدخل البيانات' || text === 'ممرضة' || text.startsWith('الممرضة ')) return text;
  return `الممرضة ${text}`;
};

const canManageItems = (user) => user?.role === 'supervisor' || user?.role === 'data_entry';

const ACCOUNTS_STORAGE_KEY = 'emergency_staff_accounts_v1';
const ACCOUNT_ROLES = ['supervisor', 'data_entry', 'nurse'];

const builtinAccounts = () => ([
  { username: 'supervisor', fullName: 'مشرف', role: 'supervisor', password: 'Ss@102938', blocked: false },
  { username: 'data_entry', fullName: 'مدخل البيانات', role: 'data_entry', password: 'Dd@1234', blocked: false },
  { username: 'nurse', fullName: 'ممرضة', role: 'nurse', password: 'Nn@1234', blocked: false },
  { username: 'nurse_1', fullName: 'عليا', role: 'nurse', password: 'N1@6294', blocked: false },
  { username: 'nurse_2', fullName: 'رضا', role: 'nurse', password: 'N2@8537', blocked: false },
  { username: 'nurse_3', fullName: 'اماني', role: 'nurse', password: 'N3@4718', blocked: false },
  { username: 'nurse_4', fullName: 'اسماء', role: 'nurse', password: 'N4@2065', blocked: false },
]);

const normalizeAccount = (row) => {
  const role = ACCOUNT_ROLES.includes(row?.role) ? row.role : 'nurse';
  return {
    username: String(row?.username || '').trim().toLowerCase(),
    fullName: String(row?.fullName || row?.full_name || '').trim(),
    role,
    password: String(row?.password || ''),
    blocked: row?.blocked === true || row?.blocked === 'true',
    profileId: row?.profileId || null,
  };
};

const readLocalAccounts = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCOUNTS_STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.map(normalizeAccount).filter((row) => row.username && row.password) : [];
  } catch {
    return [];
  }
};

const mergeAccounts = (base, extra) => {
  const map = new Map((base || []).map((account) => [account.username, account]));
  for (const account of extra || []) {
    if (!account?.username) continue;
    map.set(account.username, { ...map.get(account.username), ...account, username: account.username });
  }
  const roleOrder = { supervisor: 0, data_entry: 1, nurse: 2 };
  return [...map.values()].sort((a, b) => (
    (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9) || a.username.localeCompare(b.username)
  ));
};

let accountsRemoteReady = false;

const loadAccountList = async () => {
  const local = mergeAccounts(builtinAccounts(), readLocalAccounts());
  const { data, error } = await supabase
    .from('staff_accounts')
    .select('username,full_name,role,password,blocked');
  if (error) {
    accountsRemoteReady = false;
    return local;
  }
  accountsRemoteReady = true;
  const remote = (data || []).map(normalizeAccount).filter((row) => row.username && row.password);
  if (remote.length === 0) {
    const seed = local.map((account) => ({
      username: account.username,
      full_name: account.fullName,
      role: account.role,
      password: account.password,
      blocked: account.blocked,
    }));
    const { error: seedError } = await supabase.from('staff_accounts').upsert(seed, { onConflict: 'username' });
    if (seedError) console.error(seedError);
    return local;
  }
  return mergeAccounts(local, remote);
};

const saveAccountList = async (list) => {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(list));
  if (!accountsRemoteReady) {
    const probe = await supabase.from('staff_accounts').select('username').limit(1);
    accountsRemoteReady = !probe.error;
  }
  if (!accountsRemoteReady) return { remote: false };
  const payload = list.map((account) => ({
    username: account.username,
    full_name: account.fullName,
    role: account.role,
    password: account.password,
    blocked: Boolean(account.blocked),
  }));
  const { error } = await supabase.from('staff_accounts').upsert(payload, { onConflict: 'username' });
  if (error) console.error(error);
  return { remote: !error, error };
};
const KNOWN_NURSE_IDS = {
  'ae5fe82f-0b40-4292-923c-4154f12a4ac0': 'nurse_1',
  'd6279f65-94ac-4d4b-a56b-8374a0ebe504': 'nurse_2',
  'ac717d1f-c264-4199-a162-f30c5ab342b6': 'nurse_3',
  'c38d4773-183c-4192-af72-9f5cc8df23d6': 'nurse_4',
};
const mapNurseProfiles = (rows) => {
  const used = new Set();
  const mapped = (rows || []).slice(0, 4).map((row) => {
    const username = KNOWN_NURSE_IDS[row.id] || '';
    if (username) used.add(username);
    return { ...row, username };
  });
  let next = 1;
  return mapped
    .map((row) => {
      if (row.username) return row;
      while (used.has(`nurse_${next}`)) next += 1;
      const username = `nurse_${next}`;
      used.add(username);
      next += 1;
      return { ...row, username };
    })
    .sort((a, b) => a.username.localeCompare(b.username));
};
const STORAGE_OPTIONS = ['حرارة الغرفة', 'يحفظ في الثلاجة'];

let inventorySupportsStorage = false;
let inventorySupportsUnits = false;
let inventorySupportsAlert = false;

const lowStockLimitOf = (item) => {
  const limit = Math.floor(Number(item?.lowStockAlert));
  return Number.isInteger(limit) && limit >= 0 ? limit : 6;
};

const isLowStock = (item) => (
  totalUnitsOf(item) > 0
  && Math.floor(totalUnitsOf(item) / unitsPerBoxOf(item)) <= lowStockLimitOf(item)
);

const unitsPerBoxOf = (item) => {
  const count = Math.floor(Number(item?.unitsPerBox));
  return count > 0 ? count : 1;
};

const totalUnitsOf = (item) => {
  if (item?.totalUnits !== undefined && item?.totalUnits !== null && item.totalUnits !== '') {
    return Math.max(0, Math.floor(Number(item.totalUnits) || 0));
  }
  return Math.max(0, Math.floor(Number(item?.quantity) || 0) * unitsPerBoxOf(item));
};

const withStock = (item, totalUnits, unitsPerBox = unitsPerBoxOf(item)) => {
  const perBox = Math.max(1, Math.floor(Number(unitsPerBox) || 1));
  const total = Math.max(0, Math.floor(Number(totalUnits) || 0));
  return {
    ...item,
    unitsPerBox: perBox,
    totalUnits: total,
    quantity: Math.floor(total / perBox),
  };
};

const formatStock = (item) => {
  const perBox = unitsPerBoxOf(item);
  const total = totalUnitsOf(item);
  const boxes = Math.floor(total / perBox);
  const loose = total % perBox;
  if (loose === 0) return `${boxes} علبة (${total} حبة)`;
  return `${boxes} علبة + ${loose} حبة (${total} حبة)`;
};

const isoDate = (value) => {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : String(value || '');
};

const fefoRefusalMessage = (expiryDate) =>
  `عفواً، لا يمكن صرف هذه العلبة! توجد علبة أقدم متوفرة في المخزون (تاريخ انتهاء الصلاحية: ${isoDate(expiryDate)}). يرجى إحضار ومسح العلبة الأقدم لإتمام الصرف.`;

const batchIdentity = (item) => `${String(item?.batchNo || '').trim()}|${isoDate(item?.expiryDate)}`;

const olderAvailableBatch = (stock, candidate) => {
  if (!candidate) return null;
  const candidateDays = calculateExpiryDays(candidate.expiryDate);
  const name = String(candidate.name || '').trim();
  return (stock || [])
    .filter((item) => (
      item.id !== candidate.id
      && String(item.name || '').trim() === name
      && item.status !== 'disposed'
      && totalUnitsOf(item) > 0
      && calculateExpiryDays(item.expiryDate) > 0
      && calculateExpiryDays(item.expiryDate) < candidateDays
    ))
    .sort((a, b) => calculateExpiryDays(a.expiryDate) - calculateExpiryDays(b.expiryDate))[0] || null;
};

const inventorySelect = () => {
  let columns = INVENTORY_COLUMNS;
  if (inventorySupportsStorage) columns += ',storage_quality';
  if (inventorySupportsUnits) columns += ',units_per_box,total_units';
  if (inventorySupportsAlert) columns += ',low_stock_alert';
  return columns;
};

const INVENTORY_COLUMNS = 'id,name,barcode,batch_no,quantity,price,expiry_date,category,status';
const LOG_COLUMNS = 'id,timestamp,action,details,type,created_at';

const toDbItem = (item) => {
  const perBox = unitsPerBoxOf(item);
  const total = totalUnitsOf(item);
  const row = {
    name: item.name,
    barcode: String(item.barcode ?? ''),
    batch_no: item.batchNo,
    quantity: Math.floor(total / perBox),
    price: Number(item.price) || 0,
    expiry_date: item.expiryDate,
    category: item.category,
    status: item.status || 'active',
  };
  if (inventorySupportsStorage) {
    row.storage_quality = item.storageQuality || 'حرارة الغرفة';
  }
  if (inventorySupportsUnits) {
    row.units_per_box = perBox;
    row.total_units = total;
  }
  if (inventorySupportsAlert) {
    row.low_stock_alert = lowStockLimitOf(item);
  }
  return row;
};

const fromDbItem = (row, fallback) => {
  const fallbackItem = fallback && typeof fallback === 'object' ? fallback : null;
  const fallbackQuality = typeof fallback === 'string' ? fallback : fallbackItem?.storageQuality;
  const unitsPerBox = Number(row.units_per_box) || fallbackItem?.unitsPerBox || 1;
  const hasTotal = row.total_units !== undefined && row.total_units !== null && row.total_units !== '';
  const totalUnits = hasTotal
    ? Number(row.total_units)
    : (fallbackItem?.totalUnits ?? (Number(row.quantity) || 0) * unitsPerBox);
  return withStock({
    id: row.id,
    name: row.name,
    barcode: row.barcode,
    batchNo: row.batch_no,
    price: Number(row.price) || 0,
    expiryDate: row.expiry_date,
    category: row.category,
    status: row.status,
    storageQuality: row.storage_quality || fallbackQuality || 'حرارة الغرفة',
    lowStockAlert: lowStockLimitOf({ lowStockAlert: row.low_stock_alert ?? fallbackItem?.lowStockAlert }),
  }, totalUnits, unitsPerBox);
};

const toDbLog = (log) => ({
  timestamp: log.timestamp,
  action: log.action,
  details: log.details,
  type: log.type,
});

const fromDbLog = (row) => ({
  id: row.id,
  timestamp: row.timestamp,
  createdAt: row.created_at || null,
  action: row.action,
  details: sanitizeLogDetails(row.details),
  type: row.type,
});

const parseArabicDate = (value) => {
  if (!value) return null;
  const normalized = String(value)
    .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
    .replace(/[^\d/:صم\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const match = normalized.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(ص|م)?/);
  if (!match) return null;
  let hour = Number(match[4]);
  if (match[7] === 'م' && hour < 12) hour += 12;
  if (match[7] === 'ص' && hour === 12) hour = 0;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), hour, Number(match[5]), Number(match[6] || 0));
  return Number.isNaN(date.getTime()) ? null : date;
};

const logDate = (log) => {
  if (log?.createdAt) {
    const created = new Date(log.createdAt);
    if (!Number.isNaN(created.getTime())) return created;
  }
  if (typeof log?.id === 'number' && log.id > 1e11) return new Date(log.id);
  return parseArabicDate(log?.timestamp);
};

const periodRange = (period, now = new Date()) => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  if (period === 'weekly') {
    start.setDate(start.getDate() - ((start.getDay() + 1) % 7));
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 7);
  } else if (period === 'yearly') {
    start.setMonth(0, 1);
    end.setFullYear(start.getFullYear() + 1, 0, 1);
  } else {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 1);
  }
  return { start, end };
};

const parseDispenseLog = (log) => {
  const details = String(log.details || '');
  const fileMatch = details.match(/ملف المريض\s+([^\s—]+)/);
  const amountMatch = details.match(/صرف\s+(\d+)\s+(حبة|علبة|عبوة)/);
  const pillsMatch = details.match(/\((\d+)\s+حبة\)/);
  const nameMatch = details.match(/من\s+(.+?)\s+\(دفعة\s+([^)]+)\)/);
  const whoMatch = details.match(/الصارف:\s*(.+?)(?:\s+\[|$)/) || details.match(/\[([^\]]+)\]\s*$/);
  const count = amountMatch ? Number(amountMatch[1]) : 0;
  const byPill = amountMatch?.[2] === 'حبة';
  const pills = pillsMatch ? Number(pillsMatch[1]) : (byPill ? count : 0);
  const quantityLabel = !count
    ? '—'
    : byPill
      ? `${count} حبة`
      : pills
        ? `${count} علبة (${pills} حبة)`
        : `${count} علبة`;
  return {
    id: log.id,
    name: nameMatch?.[1]?.trim() || '—',
    batch: nameMatch?.[2]?.trim() || '',
    quantityLabel,
    pills,
    boxes: byPill ? 0 : count,
    fileNo: fileMatch?.[1] || '—',
    at: logDate(log),
    who: formatDispenser(whoMatch?.[1]),
  };
};

const formatDateTime = (date) => (
  date ? date.toLocaleString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
);

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
  const [expensePeriod, setExpensePeriod] = useState('weekly');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [patientFileNumber, setPatientFileNumber] = useState('');
  const [dispenseQty, setDispenseQty] = useState('');
  const [dispenseUnit, setDispenseUnit] = useState('box');
  const [scanMode, setScanMode] = useState('dispense');
  const [activeTab, setActiveTab] = useState('all');
  const [message, setMessage] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const [newItem, setNewItem] = useState({
    name: '',
    barcode: '',
    batchNo: '',
    quantity: 10,
    unitsPerBox: 1,
    price: 10.00,
    expiryDate: '',
    category: 'أدوية',
    storageQuality: 'حرارة الغرفة',
    lowStockAlert: 6,
  });
  const [editingId, setEditingId] = useState(null);
  const [entrySlip, setEntrySlip] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [accounts, setAccounts] = useState(() => mergeAccounts(builtinAccounts(), readLocalAccounts()));
  const [accountDrafts, setAccountDrafts] = useState({});
  const [accountsOnServer, setAccountsOnServer] = useState(false);
  const [newAccount, setNewAccount] = useState({ username: '', fullName: '', role: 'nurse', password: '' });

  const barcodeRef = useRef(null);
  const messageTimer = useRef(null);
  const itemsRef = useRef(items);
  const logsRef = useRef(logs);
  const remoteReady = useRef(false);
  const pendingInsert = useRef(new Set());
  const syncQueue = useRef(Promise.resolve());
  const deletedIds = useRef(new Set());
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
    if (currentUser?.role !== 'nurse' || profiles.length === 0) return;
    const savedName = profiles.find((row) => row.username === currentUser.id)?.full_name?.trim();
    if (savedName && savedName !== currentUser.name) {
      setCurrentUser((user) => (user ? { ...user, name: savedName } : user));
    }
  }, [profiles, currentUser]);

  useEffect(() => {
    let cancelled = false;

    const loadRemote = async () => {
      const storageProbe = await supabase.from('inventory').select('storage_quality').limit(1);
      inventorySupportsStorage = !storageProbe.error;
      const unitsProbe = await supabase.from('inventory').select('units_per_box,total_units').limit(1);
      inventorySupportsUnits = !unitsProbe.error;
      const alertProbe = await supabase.from('inventory').select('low_stock_alert').limit(1);
      inventorySupportsAlert = !alertProbe.error;

      const { data: inventoryRows, error: inventoryError } = await supabase
        .from('inventory')
        .select(inventorySelect())
        .order('id', { ascending: true });

      if (cancelled) return;
      if (inventoryError) {
        console.error(inventoryError);
        return;
      }

      const remembered = new Map(itemsRef.current.map((item) => [String(item.id), item]));
      const mapRows = (rows) => (rows || []).map((row) => fromDbItem(row, remembered.get(String(row.id))));

      if (inventoryRows.length === 0) {
        const seed = itemsRef.current.map(toDbItem);
        const { data: inserted, error: insertError } = await supabase
          .from('inventory')
          .insert(seed)
          .select(inventorySelect());
        if (cancelled) return;
        if (insertError) {
          console.error(insertError);
          return;
        }
        remoteReady.current = true;
        setItems(mapRows(inserted));
      } else {
        remoteReady.current = true;
        setItems(mapRows(inventoryRows));
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
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, role, full_name')
        .eq('role', 'nurse')
        .order('id', { ascending: true });
      const mapped = mapNurseProfiles(profileRows);
      if (!cancelled && profileRows) {
        setProfiles(mapped);
      }
      const accountList = await loadAccountList();
      if (!cancelled) {
        const named = accountList.map((account) => {
          const profile = mapped.find((row) => row.username === account.username);
          const builtin = builtinAccounts().find((row) => row.username === account.username);
          const fullName = profile?.full_name && (!builtin || account.fullName === builtin.fullName)
            ? profile.full_name
            : account.fullName;
          return { ...account, fullName, profileId: profile?.id || null };
        });
        setAccounts(named);
        setAccountsOnServer(accountsRemoteReady);
        setAccountDrafts(Object.fromEntries(named.map((account) => [account.username, {
          fullName: account.fullName,
          role: account.role,
          password: '',
          blocked: account.blocked,
        }])));
        const sessionName = currentUser?.username || (currentUser?.id === 'ADM-101' ? 'supervisor' : currentUser?.id);
        if (named.some((account) => account.username === sessionName && account.blocked)) {
          setCurrentUser(null);
          setLoginError('هذا الحساب محظور. راجعي المشرف.');
        }
      }
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
        if (deletedIds.current.has(current.id)) {
          await supabase.from('inventory').delete().eq('id', current.id);
          continue;
        }
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
          .select(inventorySelect());
        pendingInsert.current.delete(current.id);

        if (insertError) {
          console.error(insertError);
          continue;
        }
        if (inserted?.[0] && inserted[0].id !== current.id) {
          setItems((prev) => prev.map((row) => row.id === current.id ? fromDbItem(inserted[0], row) : row));
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

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');

    const username = loginForm.username.trim().toLowerCase();
    const password = loginForm.password.trim();
    const accountList = await loadAccountList();
    setAccounts(accountList);
    setAccountsOnServer(accountsRemoteReady);
    const account = accountList.find((row) => row.username === username);

    if (!account || account.password !== password) {
      setLoginError('اسم المستخدم أو كلمة المرور غير صحيحة!');
      playSound('error');
      return;
    }
    if (account.blocked) {
      setLoginError('هذا الحساب محظور. راجعي المشرف.');
      playSound('error');
      return;
    }

    const user = {
      name: account.fullName || actorLabel({ role: account.role }),
      role: account.role,
      id: account.username,
      username: account.username,
    };
    setCurrentUser(user);
    setActiveTab('all');
    if (account.role === 'data_entry') setScanMode('checkin');
    if (account.role === 'nurse') setScanMode('dispense');
    addLog('تسجيل دخول', 'تسجيل دخول', 'system', user);
    playSound('success');
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
    const userString = details.includes('الصارف:') || !label ? '' : ` [${label}]`;
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
  const lowStockItems = activeItems.filter(isLowStock);
  const outOfStockItems = activeItems.filter(i => totalUnitsOf(i) === 0);

  const expiredCount = expiredItems.filter(i => totalUnitsOf(i) > 0).length;
  const nearExpiryCount = nearExpiryItems.filter(i => totalUnitsOf(i) > 0).length;
  const lowStockCount = lowStockItems.length;
  const outOfStockCount = outOfStockItems.length;

  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    const scannedCode = barcodeInput.trim();
    if (!scannedCode) {
      showMessage('امسحي الباركود قبل حفظ العملية.', 'error');
      playSound('error');
      return;
    }

    if (currentUser?.role === 'data_entry') {
      showMessage('صلاحية مدخل البيانات لا تشمل الصرف.', 'error');
      return;
    }

    const dispensing = scanMode === 'dispense' || currentUser?.role === 'nurse';
    const matchingBatches = activeItems.filter(i => i.barcode === scannedCode);

    if (matchingBatches.length === 0) {
      playSound('error');
      showMessage(`الباركود (${scannedCode}) غير مسجل في النظام!`, 'error');
      return;
    }

    if (dispensing) {
      const fileNo = patientFileNumber.trim();
      const count = Number(dispenseQty);
      if (!fileNo || !Number.isInteger(count) || count < 1) {
        playSound('error');
        showMessage('لا يُحفظ الصرف إلا بعد إدخال رقم ملف المريض والكمية والوحدة.', 'error');
        return;
      }

      const availableBatches = matchingBatches
        .filter(b => totalUnitsOf(b) > 0 && calculateExpiryDays(b.expiryDate) > 0);

      if (availableBatches.length === 0) {
        playSound('error');
        const expiredMatch = matchingBatches.find(b => totalUnitsOf(b) > 0 && calculateExpiryDays(b.expiryDate) <= 0);
        if (expiredMatch) {
          showMessage(`❌ تنبيه أمني: الدفعة المتبقية من (${expiredMatch.name}) منتهية الصلاحية!`, 'error');
          addLog('تنبيه أمني', `محاولة صرف دواء منتهي الصلاحية: ${expiredMatch.name} — ملف ${fileNo}`, 'alert');
        } else {
          showMessage('عذراً، جميع دفعات هذا الدواء نافدة تماماً!', 'error');
        }
        return;
      }

      const newestMatch = [...availableBatches].sort(
        (a, b) => calculateExpiryDays(b.expiryDate) - calculateExpiryDays(a.expiryDate)
      )[0];
      const olderBatch = olderAvailableBatch(activeItems, newestMatch);
      if (olderBatch) {
        playSound('error');
        showMessage(fefoRefusalMessage(olderBatch.expiryDate), 'fefo');
        return;
      }

      const targetBatch = availableBatches.find(
        (batch) => batchIdentity(batch) === batchIdentity(newestMatch)
      ) || newestMatch;
      const perBox = unitsPerBoxOf(targetBatch);
      const pills = dispenseUnit === 'box' ? count * perBox : count;
      const available = totalUnitsOf(targetBatch);
      if (pills > available) {
        playSound('error');
        showMessage(`الكمية المطلوبة ${pills} حبة، والمتاح في الدفعة ${targetBatch.batchNo} هو ${available} حبة فقط.`, 'error');
        return;
      }

      const updatedBatch = withStock(targetBatch, available - pills, perBox);
      setItems(items.map(item => item.id === targetBatch.id ? updatedBatch : item));
      playSound('success');
      const unitLabel = dispenseUnit === 'box' ? 'علبة' : 'حبة';
      showMessage(`تم صرف ${count} ${unitLabel} (${pills} حبة) من ${targetBatch.name} (دفعة ${targetBatch.batchNo}). المتبقي ${updatedBatch.totalUnits} حبة.`, 'success');
      addLog(
        'صرف دواء',
        `ملف المريض ${fileNo} — صرف ${count} ${unitLabel} (${pills} حبة) من ${targetBatch.name} (دفعة ${targetBatch.batchNo}). المتبقي ${updatedBatch.totalUnits} حبة. الصارف: ${dispenserLabel(currentUser, profiles)}`,
        'dispense'
      );
      setBarcodeInput('');
      setDispenseQty('');
      return;
    }

    const sortedByNewest = [...matchingBatches].sort((a, b) => calculateExpiryDays(b.expiryDate) - calculateExpiryDays(a.expiryDate));
    const targetBatch = sortedByNewest[0];
    const updatedBatch = withStock(targetBatch, totalUnitsOf(targetBatch) + unitsPerBoxOf(targetBatch));
    setItems(items.map(item => item.id === targetBatch.id ? updatedBatch : item));
    playSound('success');
    showMessage(`تم زيادة مخزون: ${targetBatch.name} [دفعة: ${targetBatch.batchNo}] بمقدار علبة واحدة (${unitsPerBoxOf(targetBatch)} حبة).`, 'success');
    addLog('إضافة مخزون', `إضافة 1 علبة (${unitsPerBoxOf(targetBatch)} حبة) لـ ${targetBatch.name} (دفعة ${targetBatch.batchNo})`, 'checkin');
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
      const updated = items.map(i => i.id === id ? withStock({ ...i, status: 'disposed' }, 0) : i);
      setItems(updated);
      playSound('success');
      showMessage(`🗑️ تم نقل الدفعة (${target.batchNo}) إلى سجل التالف والمستبعد.`, 'success');
      addLog('إتلاف دواء', `إتلاف واستبعاد دفعة ${target.batchNo} لـ ${target.name}`, 'dispose');
    }
  };

  const resetItemForm = () => {
    setEditingId(null);
    setNewItem({
      name: '',
      barcode: '',
      batchNo: '',
      quantity: 10,
      unitsPerBox: 1,
      price: 10.00,
      expiryDate: '',
      category: 'أدوية',
      storageQuality: 'حرارة الغرفة',
      lowStockAlert: 6,
    });
  };

  const openEditItem = (item) => {
    setEditingId(item.id);
    setNewItem({
      name: item.name,
      barcode: item.barcode,
      batchNo: item.batchNo,
      quantity: item.quantity,
      unitsPerBox: unitsPerBoxOf(item),
      price: item.price,
      expiryDate: item.expiryDate,
      category: item.category === 'أدوية حرجة' ? 'أدوية' : item.category,
      storageQuality: item.storageQuality || 'حرارة الغرفة',
      lowStockAlert: lowStockLimitOf(item),
    });
    setShowAddForm(true);
    setActiveTab('all');
  };

  const handleDeleteItem = (id) => {
    if (!canManageItems(currentUser)) return;
    const target = items.find((item) => item.id === id);
    if (!target) return;
    if (!window.confirm(`هل تريد حذف الصنف (${target.name}) دفعة ${target.batchNo}؟`)) return;
    deletedIds.current.add(id);
    supabase.from('inventory').delete().eq('id', id).then(({ error }) => {
      if (error) console.error(error);
    });
    setItems((prev) => prev.filter((item) => item.id !== id));
    if (editingId === id) {
      resetItemForm();
      setShowAddForm(false);
    }
    playSound('success');
    showMessage(`تم حذف الصنف (${target.name}).`, 'success');
    addLog('حذف صنف', `حذف ${target.name} (دفعة ${target.batchNo})`, 'delete');
  };

  const handleAddNewItemSubmit = (e) => {
    e.preventDefault();
    if (!canManageItems(currentUser)) {
      alert('إضافة الأصناف وتعديلها متاحة للمشرف ومدخل البيانات فقط.');
      return;
    }

    const perBox = Math.floor(Number(newItem.unitsPerBox));
    const alertAt = Number(newItem.lowStockAlert);
    if (!newItem.name || !newItem.barcode || !newItem.batchNo || !newItem.expiryDate || !newItem.storageQuality || perBox < 1 || !Number.isInteger(alertAt) || alertAt < 0) {
      alert('يرجى ملء جميع الحقول المطلوبة، بما فيها جودة الحفظ وعدد حبات العلبة وحد تنبيه النفاذ.');
      return;
    }

    const previous = items.find((item) => item.id === editingId);
    const boxes = Math.max(0, Math.floor(Number(newItem.quantity) || 0));
    const loose = previous && unitsPerBoxOf(previous) === perBox ? totalUnitsOf(previous) % perBox : 0;
    const savedItem = withStock({
      id: editingId || Date.now(),
      name: newItem.name,
      barcode: newItem.barcode.trim(),
      batchNo: newItem.batchNo.trim(),
      price: Number(newItem.price) || 0,
      expiryDate: newItem.expiryDate,
      category: newItem.category,
      storageQuality: newItem.storageQuality,
      lowStockAlert: alertAt,
      status: previous?.status || 'active',
    }, boxes * perBox + loose, perBox);

    if (editingId) {
      setItems((prev) => prev.map((item) => item.id === editingId ? { ...item, ...savedItem } : item));
      showMessage(`تم تعديل الصنف (${savedItem.name}).`, 'success');
      addLog('تعديل صنف', `تعديل ${savedItem.name} (دفعة ${savedItem.batchNo}) — ${savedItem.unitsPerBox} حبة/علبة — تنبيه النفاذ ${savedItem.lowStockAlert} علبة — ${savedItem.storageQuality}`, 'edit');
    } else {
      setItems((prev) => [...prev, savedItem]);
      showMessage(`تم إضافة الصنف (${savedItem.name}).`, 'success');
      addLog('تسجيل صنف', `تسجيل شحنة جديدة: ${savedItem.name} (كمية ${savedItem.quantity} علبة × ${savedItem.unitsPerBox} حبة) — تنبيه النفاذ ${savedItem.lowStockAlert} علبة — ${savedItem.storageQuality}`, 'add');
    }

    setEntrySlip({ ...savedItem, action: editingId ? 'تعديل' : 'إدخال' });
    setShowAddForm(false);
    resetItemForm();
    if (currentUser?.role === 'data_entry') setActiveTab('entryReport');
    playSound('success');
  };

  const publishAccounts = async (list, message) => {
    if (currentUser?.role !== 'supervisor') return;
    const result = await saveAccountList(list);
    setAccounts(list);
    setAccountsOnServer(result.remote);
    setAccountDrafts(Object.fromEntries(list.map((account) => [account.username, {
      fullName: account.fullName,
      role: account.role,
      password: '',
      blocked: account.blocked,
    }])));
    if (result.error) {
      showMessage('تعذر حفظ الحسابات على الخادم. بقيت محفوظة على هذا المتصفح.', 'error');
      return;
    }
    showMessage(message, 'success');
  };

  const handleSaveAccount = async (username) => {
    if (currentUser?.role !== 'supervisor') return;
    const current = accounts.find((account) => account.username === username);
    const draft = accountDrafts[username];
    if (!current || !draft) return;
    const fullName = draft.fullName.trim();
    if (!fullName) {
      alert('اسم الحساب مطلوب.');
      return;
    }
    const password = draft.password.trim() || current.password;
    if (password.length < 4) {
      alert('كلمة المرور يجب أن تكون ٤ أحرف على الأقل.');
      return;
    }
    const sessionName = currentUser.username || (currentUser.id === 'ADM-101' ? 'supervisor' : currentUser.id);
    if (draft.blocked && username === sessionName) {
      alert('لا يمكن حظر الحساب الذي تستخدمه الآن.');
      return;
    }
    if (username === 'supervisor' && (draft.role !== 'supervisor' || draft.blocked)) {
      alert('حساب المشرف الأساسي يبقى مفتوحاً بصلاحية المشرف.');
      return;
    }
    const nextAccount = {
      ...current,
      fullName,
      role: draft.role,
      password,
      blocked: username === 'supervisor' ? false : Boolean(draft.blocked),
    };
    const activeSupervisors = accounts.filter((account) => {
      const role = account.username === username ? nextAccount.role : account.role;
      const blocked = account.username === username ? nextAccount.blocked : account.blocked;
      return role === 'supervisor' && !blocked;
    });
    if (activeSupervisors.length === 0) {
      alert('يجب أن يبقى مشرف واحد على الأقل بدون حظر.');
      return;
    }
    const list = mergeAccounts(accounts, [nextAccount]);
    if (nextAccount.profileId) {
      const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', nextAccount.profileId);
      if (error) console.error(error);
      setProfiles((prev) => prev.map((profile) => profile.id === nextAccount.profileId ? { ...profile, full_name: fullName } : profile));
    }
    await publishAccounts(list, `تم حفظ حساب ${username}.`);
    addLog('تعديل حساب', `تحديث حساب ${username}`, 'system');
  };

  const handleAddAccount = async (e) => {
    e.preventDefault();
    if (currentUser?.role !== 'supervisor') return;
    const username = newAccount.username.trim().toLowerCase();
    const fullName = newAccount.fullName.trim();
    const password = newAccount.password.trim();
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      alert('اسم المستخدم حروف إنجليزية صغيرة وأرقام وشرطة سفلية، من ٣ إلى ٣٠.');
      return;
    }
    if (accounts.some((account) => account.username === username)) {
      alert('اسم المستخدم موجود مسبقاً.');
      return;
    }
    if (!fullName || password.length < 4) {
      alert('الاسم وكلمة المرور مطلوبان، وكلمة المرور ٤ أحرف على الأقل.');
      return;
    }
    const list = mergeAccounts(accounts, [{
      username,
      fullName,
      role: ACCOUNT_ROLES.includes(newAccount.role) ? newAccount.role : 'nurse',
      password,
      blocked: false,
    }]);
    await publishAccounts(list, `تمت إضافة الحساب ${username}.`);
    setNewAccount({ username: '', fullName: '', role: 'nurse', password: '' });
    addLog('إضافة حساب', `إضافة حساب ${username}`, 'system');
  };

  const showMessage = (text, type) => {
    setMessage({ text, type });
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setMessage(null), type === 'fefo' ? 12000 : 5000);
  };

  const filteredItems = items.filter(item => {
    if (activeTab === 'disposed') return item.status === 'disposed';
    if (item.status !== 'active') return false;
    if (activeTab === 'lowStock') return isLowStock(item);
    if (activeTab === 'expiryAlert') return calculateExpiryDays(item.expiryDate) <= 30;
    return true;
  });

  const filteredLogs = logs.filter(log => {
    if (logFilter === 'all') return true;
    return log.type === logFilter;
  });

  const expenseWindow = periodRange(expensePeriod);
  const expenseRows = logs
    .filter((log) => log.type === 'dispense' || log.action === 'صرف دواء')
    .map(parseDispenseLog)
    .filter((row) => row.at && row.at >= expenseWindow.start && row.at < expenseWindow.end)
    .sort((a, b) => b.at - a.at);
  const expensePillTotal = expenseRows.reduce((sum, row) => sum + row.pills, 0);
  const expenseBoxTotal = expenseRows.reduce((sum, row) => sum + row.boxes, 0);
  const expensePeriodTitle = expensePeriod === 'weekly' ? 'الأسبوعي' : expensePeriod === 'yearly' ? 'السنوي' : 'الشهري';

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
          #printable-logs,
          #printable-entry {
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
          #printable-logs *,
          #printable-entry * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #printable-report table,
          #printable-logs table,
          #printable-entry table {
            width: 100% !important;
            border-collapse: collapse !important;
            page-break-inside: auto;
          }
          #printable-report th,
          #printable-report td,
          #printable-logs th,
          #printable-logs td,
          #printable-entry th,
          #printable-entry td {
            border: 1px solid #333 !important;
            color: #000 !important;
            background: #fff !important;
          }
          #printable-report tr,
          #printable-logs tr,
          #printable-entry tr,
          #printable-report h2,
          #printable-report h3,
          #printable-logs h2,
          #printable-entry h2 {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          #printable-report thead,
          #printable-logs thead,
          #printable-entry thead { display: table-header-group; }
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
                المستخدم الحالي: <span className="font-bold text-slate-800">{currentUser.role === 'nurse' && currentUser.name && currentUser.name !== 'ممرضة' ? `${currentUser.name} — ${actorLabel(currentUser)}` : actorLabel(currentUser)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {(currentUser.role === 'supervisor' || currentUser.role === 'data_entry') && (
              <>
                <button
                  onClick={() => {
                    if (showAddForm) {
                      setShowAddForm(false);
                      resetItemForm();
                    } else {
                      resetItemForm();
                      setShowAddForm(true);
                    }
                  }}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold rounded-2xl text-xs shadow-lg transition flex items-center gap-1.5"
                >
                  <span>{showAddForm ? '✕ إغلاق' : '✨ إضافة صنف'}</span>
                </button>
                <button
                  onClick={() => setActiveTab('entryReport')}
                  className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-2xl text-xs border border-slate-200/80 shadow-md transition flex items-center gap-1.5"
                >
                  <span>🖨️ تقرير الإدخال</span>
                </button>
              </>
            )}
            {currentUser.role === 'supervisor' && (
              <>
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
                <button
                  onClick={() => setActiveTab('settings')}
                  className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-2xl text-xs border border-slate-200/80 shadow-md transition flex items-center gap-1.5"
                >
                  <span>⚙️ الإعدادات</span>
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
        {showAddForm && canManageItems(currentUser) && (
          <div className="bg-white/90 backdrop-blur-xl border border-emerald-500/30 p-6 rounded-3xl shadow-2xl space-y-4 no-print animate-in fade-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-emerald-700 flex items-center gap-2">
                <span>💊</span> {editingId ? 'تعديل الصنف' : 'إضافة صنف أو شحنة جديدة'}
              </h3>
              <button onClick={() => { setShowAddForm(false); resetItemForm(); }} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
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
                    <option value="أدوية">أدوية</option>
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
                  <label className="block text-slate-700 font-bold mb-1">عدد العلب *</label>
                  <input
                    type="number"
                    min="0"
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">حبات العلبة الواحدة *</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={newItem.unitsPerBox}
                    onChange={(e) => setNewItem({ ...newItem, unitsPerBox: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200 rounded-2xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">تنبيه النفاذ (بالعلبة) *</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={newItem.lowStockAlert}
                    onChange={(e) => setNewItem({ ...newItem, lowStockAlert: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200 rounded-2xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">يظهر التنبيه عندما يصبح عدد العلب عند هذا الرقم أو أقل.</p>
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">جودة الحفظ *</label>
                <select
                  required
                  value={newItem.storageQuality}
                  onChange={(e) => setNewItem({ ...newItem, storageQuality: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50/80 border border-slate-200 rounded-2xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                >
                  {STORAGE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition shadow-lg shadow-emerald-600/20"
                >
                  {editingId ? 'حفظ التعديل' : 'تأكيد وحفظ الدفعة'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* المؤشرات */}
        {currentUser.role !== 'data_entry' && (
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
              <span className="text-xs font-bold text-slate-400">منخفض المخزون</span>
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
        )}

        {/* الكارت الرئيسي */}
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl shadow-slate-200/60 border border-white/80 overflow-hidden">
          {message && (
            <div className={`m-4 p-4 rounded-2xl font-bold no-print ${
              message.type === 'fefo'
                ? 'bg-red-600 text-white border border-red-700 text-sm leading-7'
                : message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs'
                  : 'bg-red-50 text-red-700 border border-red-200 text-xs'
            }`}>
              {message.text}
            </div>
          )}
          
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
              تنبيه النفاذ
            </button>

            <button
              onClick={() => setActiveTab('expiryAlert')}
              className={`px-5 py-2.5 rounded-2xl text-xs md:text-sm font-bold transition-all ${
                activeTab === 'expiryAlert' ? 'bg-red-500 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60'
              }`}
            >
              تنبيه الصلاحية (≤30 يوم)
            </button>

            {canManageItems(currentUser) && (
              <button
                onClick={() => setActiveTab('entryReport')}
                className={`px-5 py-2.5 rounded-2xl text-xs md:text-sm font-bold transition-all ${
                  activeTab === 'entryReport' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                }`}
              >
                🖨️ تقرير الإدخال الفوري
              </button>
            )}

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
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <h3 className="font-bold text-xs text-sky-900 bg-sky-50 p-2 rounded-lg border border-sky-200">💊 تقرير المصروفات {expensePeriodTitle}</h3>
                    <div className="flex flex-wrap gap-2 no-print">
                      {[
                        ['weekly', 'تقرير أسبوعي'],
                        ['monthly', 'تقرير شهري'],
                        ['yearly', 'تقرير سنوي'],
                      ].map(([period, label]) => (
                        <button
                          key={period}
                          type="button"
                          onClick={() => setExpensePeriod(period)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold ${
                            expensePeriod === period ? 'bg-sky-700 text-white' : 'bg-white text-slate-600 border border-slate-200'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    من {expenseWindow.start.toLocaleDateString('ar-SA')} إلى {new Date(expenseWindow.end.getTime() - 1).toLocaleDateString('ar-SA')}
                    {' '}— {expenseRows.length} عملية صرف
                    {expenseBoxTotal ? ` — ${expenseBoxTotal} علبة` : ''}
                    {expensePillTotal ? ` — ${expensePillTotal} حبة` : ''}
                  </p>
                  <table className="w-full text-right border-collapse border border-slate-300 text-xs">
                    <thead>
                      <tr className="bg-sky-100">
                        <th className="p-2 border">اسم الدواء</th>
                        <th className="p-2 border">الكمية المصروفة</th>
                        <th className="p-2 border">رقم ملف المريض</th>
                        <th className="p-2 border">تاريخ ووقت الصرف</th>
                        <th className="p-2 border">من صرفه</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseRows.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="p-4 border text-center text-slate-500">لا توجد عمليات صرف في هذه الفترة.</td>
                        </tr>
                      ) : expenseRows.map((row) => (
                        <tr key={row.id}>
                          <td className="p-2 border font-semibold">
                            {row.name}
                            {row.batch ? <div className="text-[11px] font-mono text-slate-500">دفعة {row.batch}</div> : null}
                          </td>
                          <td className="p-2 border font-bold">{row.quantityLabel}</td>
                          <td className="p-2 border font-mono">{row.fileNo}</td>
                          <td className="p-2 border">{formatDateTime(row.at)}</td>
                          <td className="p-2 border">{row.who}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2">
                  <h3 className="font-bold text-xs text-emerald-800 bg-emerald-50 p-2 rounded-lg border border-emerald-200">🟢 1. الأدوية والدفعات الصالحة</h3>
                  <table className="w-full text-right border-collapse border border-slate-300 text-xs">
                    <thead>
                      <tr className="bg-slate-100"><th className="p-2 border">الدواء</th><th className="p-2 border">الدفعة</th><th className="p-2 border">الكمية</th><th className="p-2 border">السعر (ر.س)</th><th className="p-2 border">تاريخ الصلاحية</th></tr>
                    </thead>
                    <tbody>
                      {validItems.map(i => (
                        <tr key={i.id}><td className="p-2 border font-semibold">{i.name}</td><td className="p-2 border font-mono">{i.batchNo}</td><td className="p-2 border">{formatStock(i)}</td><td className="p-2 border font-mono">{i.price ? i.price.toFixed(2) : '0.00'}</td><td className="p-2 border font-mono">{i.expiryDate}</td></tr>
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
                        <tr key={i.id}><td className="p-2 border font-semibold">{i.name}</td><td className="p-2 border font-mono">{i.batchNo}</td><td className="p-2 border">{formatStock(i)}</td><td className="p-2 border font-mono">{i.price ? i.price.toFixed(2) : '0.00'}</td><td className="p-2 border font-mono font-bold text-amber-800">{i.expiryDate}</td></tr>
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
          ) : activeTab === 'settings' && currentUser.role === 'supervisor' ? (
            <div className="p-6 space-y-6 bg-white">
              <div>
                <h2 className="text-xl font-black text-slate-900">إدارة الحسابات</h2>
                <p className="text-xs text-slate-500 mt-1">تغيير كلمة المرور، حظر الحساب، أو إضافة حساب جديد. هذه الصفحة للمشرف فقط.</p>
              </div>
              {!accountsOnServer && (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
                  <p className="font-bold">الحسابات تُحفظ على هذا المتصفح. حتى تعمل على بقية الأجهزة، أنشئي هذا الجدول في Supabase ثم أعيدي فتح الصفحة:</p>
                  <pre className="whitespace-pre-wrap font-mono text-[11px] leading-6 bg-white border border-amber-100 rounded-xl p-3">{`create table if not exists public.staff_accounts (
  username text primary key,
  full_name text not null,
  role text not null,
  password text not null,
  blocked boolean not null default false
);
alter table public.staff_accounts enable row level security;
create policy "staff accounts open" on public.staff_accounts
  for all using (true) with check (true);`}</pre>
                </div>
              )}
              <div className="space-y-4">
                {accounts.map((account) => {
                  const draft = accountDrafts[account.username] || {
                    fullName: account.fullName,
                    role: account.role,
                    password: '',
                    blocked: account.blocked,
                  };
                  return (
                    <div key={account.username} className="border border-slate-200 rounded-3xl p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-black text-slate-900">{account.username}</p>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${draft.blocked ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                          {draft.blocked ? 'محظور' : 'نشط'}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-700 font-bold mb-1 text-xs">الاسم</label>
                          <input
                            type="text"
                            value={draft.fullName}
                            onChange={(e) => setAccountDrafts({ ...accountDrafts, [account.username]: { ...draft, fullName: e.target.value } })}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 font-bold mb-1 text-xs">الصلاحية</label>
                          <select
                            value={draft.role}
                            onChange={(e) => setAccountDrafts({ ...accountDrafts, [account.username]: { ...draft, role: e.target.value } })}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm"
                          >
                            <option value="nurse">ممرضة</option>
                            <option value="data_entry">مدخل البيانات</option>
                            <option value="supervisor">مشرف</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-slate-700 font-bold mb-1 text-xs">كلمة المرور الجديدة</label>
                          <input
                            type="password"
                            autoComplete="new-password"
                            placeholder="اتركيها فارغة للإبقاء على الحالية"
                            value={draft.password}
                            onChange={(e) => setAccountDrafts({ ...accountDrafts, [account.username]: { ...draft, password: e.target.value } })}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mt-6">
                          <input
                            type="checkbox"
                            checked={Boolean(draft.blocked)}
                            onChange={(e) => setAccountDrafts({ ...accountDrafts, [account.username]: { ...draft, blocked: e.target.checked } })}
                          />
                          حظر هذا الحساب
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSaveAccount(account.username)}
                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl text-xs"
                      >
                        حفظ الحساب
                      </button>
                    </div>
                  );
                })}
              </div>
              <form onSubmit={handleAddAccount} className="border border-dashed border-slate-300 rounded-3xl p-4 space-y-3">
                <h3 className="font-black text-slate-900">إضافة حساب</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="اسم المستخدم"
                    value={newAccount.username}
                    onChange={(e) => setNewAccount({ ...newAccount, username: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm"
                  />
                  <input
                    type="text"
                    required
                    placeholder="الاسم الظاهر"
                    value={newAccount.fullName}
                    onChange={(e) => setNewAccount({ ...newAccount, fullName: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm"
                  />
                  <select
                    value={newAccount.role}
                    onChange={(e) => setNewAccount({ ...newAccount, role: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm"
                  >
                    <option value="nurse">ممرضة</option>
                    <option value="data_entry">مدخل البيانات</option>
                    <option value="supervisor">مشرف</option>
                  </select>
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    placeholder="كلمة المرور"
                    value={newAccount.password}
                    onChange={(e) => setNewAccount({ ...newAccount, password: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm"
                  />
                </div>
                <button type="submit" className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl text-xs">
                  إضافة الحساب
                </button>
              </form>
            </div>
          ) : activeTab === 'entryReport' && canManageItems(currentUser) ? (
            <div className="p-6 space-y-4 bg-white">
              <div className="flex justify-between items-center no-print border-b pb-4">
                <div>
                  <h2 className="text-xl font-black text-slate-900">تقرير الإدخال الفوري</h2>
                  <p className="text-xs text-slate-500 mt-1">يظهر آخر صنف تم إدخاله أو تعديله، وهو جاهز للطباعة.</p>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl text-xs"
                >
                  🖨️ طباعة التقرير
                </button>
              </div>
              <div id="printable-entry" className="print-sheet space-y-4">
                {entrySlip ? (
                  <>
                    <div className="text-center border-b pb-3">
                      <h2 className="text-2xl font-black">تقرير {entrySlip.action} صنف</h2>
                      <p className="text-xs text-slate-500 mt-1">{new Date().toLocaleString('ar-SA')} | {actorLabel(currentUser)}</p>
                    </div>
                    <table className="w-full text-right border-collapse border border-slate-300 text-sm">
                      <tbody>
                        <tr><th className="p-2 border bg-slate-50 w-40">اسم الصنف</th><td className="p-2 border">{entrySlip.name}</td></tr>
                        <tr><th className="p-2 border bg-slate-50">رقم الدفعة</th><td className="p-2 border font-mono">{entrySlip.batchNo}</td></tr>
                        <tr><th className="p-2 border bg-slate-50">الباركود</th><td className="p-2 border font-mono">{entrySlip.barcode}</td></tr>
                        <tr><th className="p-2 border bg-slate-50">الكمية</th><td className="p-2 border">{entrySlip.quantity} علبة</td></tr>
                        <tr><th className="p-2 border bg-slate-50">حبات العلبة</th><td className="p-2 border">{entrySlip.unitsPerBox || 1}</td></tr>
                        <tr><th className="p-2 border bg-slate-50">إجمالي الحبات</th><td className="p-2 border">{entrySlip.totalUnits ?? ((entrySlip.quantity || 0) * (entrySlip.unitsPerBox || 1))}</td></tr>
                        <tr><th className="p-2 border bg-slate-50">السعر</th><td className="p-2 border">{Number(entrySlip.price || 0).toFixed(2)} ر.س</td></tr>
                        <tr><th className="p-2 border bg-slate-50">تاريخ الانتهاء</th><td className="p-2 border">{entrySlip.expiryDate}</td></tr>
                        <tr><th className="p-2 border bg-slate-50">الفئة</th><td className="p-2 border">{entrySlip.category === 'أدوية حرجة' ? 'أدوية' : entrySlip.category}</td></tr>
                        <tr><th className="p-2 border bg-slate-50">تنبيه النفاذ</th><td className="p-2 border">{lowStockLimitOf(entrySlip)} علبة</td></tr>
                        <tr><th className="p-2 border bg-slate-50">جودة الحفظ</th><td className="p-2 border font-bold">{entrySlip.storageQuality}</td></tr>
                      </tbody>
                    </table>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">لا يوجد إدخال للطباعة بعد. أضيفي صنفاً أو عدّليه أولاً.</p>
                )}
              </div>
            </div>
          ) : (
            <>
              {currentUser.role !== 'data_entry' && (
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

                  <form onSubmit={handleBarcodeSubmit} className="flex-1 flex flex-col gap-3 w-full">
                    <input
                      ref={barcodeRef}
                      type="text"
                      placeholder="امسحي الباركود بالقارئ مباشرة للصرف..."
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      className="w-full px-5 py-3 bg-slate-800/90 border border-slate-700 rounded-2xl text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-400 text-sm transition"
                    />
                    {(scanMode === 'dispense' || currentUser.role === 'nurse') ? (
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <input
                          type="text"
                          required
                          placeholder="رقم ملف المريض *"
                          value={patientFileNumber}
                          onChange={(e) => setPatientFileNumber(e.target.value)}
                          className="md:col-span-2 w-full px-5 py-3 bg-slate-800/90 border border-slate-700 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 text-sm"
                        />
                        <input
                          type="number"
                          required
                          min="1"
                          step="1"
                          placeholder="العدد *"
                          value={dispenseQty}
                          onChange={(e) => setDispenseQty(e.target.value)}
                          className="w-full px-5 py-3 bg-slate-800/90 border border-slate-700 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 text-sm"
                        />
                        <select
                          required
                          value={dispenseUnit}
                          onChange={(e) => setDispenseUnit(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-800/90 border border-slate-700 rounded-2xl text-white text-sm"
                        >
                          <option value="box">بالعلبة</option>
                          <option value="pill">بالحبة</option>
                        </select>
                        <button type="submit" className="md:col-span-4 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-extrabold rounded-2xl text-xs transition shadow-lg">
                          تأكيد الصرف
                        </button>
                      </div>
                    ) : (
                      <button type="submit" className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-extrabold rounded-2xl text-xs transition shadow-lg">
                        تنفيذ الإدخال
                      </button>
                    )}
                  </form>
                </div>
              </div>
              )}

              {/* جدول المخزون الرئيسي بعمود السعر */}
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs font-bold border-b border-slate-100">
                      <th className="py-4 px-5">اسم الدواء / المستلزم</th>
                      <th className="py-4 px-5">رقم الدفعة (Batch)</th>
                      <th className="py-4 px-5">الباركود</th>
                      <th className="py-4 px-5">الكمية</th>
                      <th className="py-4 px-5">تنبيه النفاذ</th>
                      <th className="py-4 px-5">حبات العلبة</th>
                      <th className="py-4 px-5">السعر الفردي</th>
                      <th className="py-4 px-5">تاريخ الصلاحية</th>
                      <th className="py-4 px-5">جودة الحفظ</th>
                      <th className="py-4 px-5">حالة الصلاحية</th>
                      <th className="py-4 px-5 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs md:text-sm">
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan="11" className="text-center py-10 text-slate-400 font-medium">
                          لا توجد بيانات مسجلة في هذا التبويب حالياً.
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item) => {
                        const daysLeft = calculateExpiryDays(item.expiryDate);

                        let qtyBadgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200/60";
                        if (totalUnitsOf(item) === 0) {
                          qtyBadgeClass = "bg-red-50 text-red-700 border-red-200/60 font-black";
                        } else if (isLowStock(item)) {
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
                                {formatStock(item)}
                              </span>
                            </td>
                            <td className="py-4 px-5 font-bold text-slate-700">{lowStockLimitOf(item)} علبة</td>
                            <td className="py-4 px-5 font-bold text-slate-700">{unitsPerBoxOf(item)} حبة</td>
                            <td className="py-4 px-5 font-mono font-bold text-slate-700">
                              {item.price ? `${item.price.toFixed(2)} ر.س` : '0.00 ر.س'}
                            </td>
                            <td className="py-4 px-5 font-mono font-bold text-slate-700">{item.expiryDate}</td>
                            <td className="py-4 px-5 text-slate-700">{item.storageQuality || 'حرارة الغرفة'}</td>
                            <td className="py-4 px-5">
                              <span className={`inline-block px-3 py-1 rounded-xl text-xs ${expiryBadgeClass}`}>
                                {expiryText}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-center">
                              {item.status === 'disposed' ? (
                                <span className="text-xs text-slate-400 font-medium">مؤرشف في سجل التالف</span>
                              ) : (
                                <div className="flex justify-center items-center gap-1.5 flex-wrap">
                                  {canManageItems(currentUser) && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => openEditItem(item)}
                                        className="px-3 py-1.5 bg-slate-100 hover:bg-sky-50 text-slate-700 hover:text-sky-700 border border-slate-200/80 rounded-xl text-xs font-bold"
                                      >
                                        تعديل
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteItem(item.id)}
                                        className="px-3 py-1.5 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 border border-slate-200/80 rounded-xl text-xs font-bold"
                                      >
                                        حذف
                                      </button>
                                    </>
                                  )}
                                  {currentUser.role !== 'data_entry' && daysLeft <= 0 && totalUnitsOf(item) > 0 && (
                                    currentUser.role === 'supervisor' ? (
                                      <button
                                        type="button"
                                        onClick={() => handleDispose(item.id)}
                                        className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-md transition"
                                      >
                                        🗑️ إتلاف / استبعاد
                                      </button>
                                    ) : (
                                      <span className="text-xs text-red-500 font-bold">يتطلب مشرف للإتلاف</span>
                                    )
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