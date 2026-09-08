// ==========================================================================
// 1. KONFIGURASI UTAMA
// ==========================================================================
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzGqbEHYo-MsHMnr-CanG0cXICZT4gSjtRRWcz78nT9wrDppLpWES5ClYN_1aL14HWCRA/exec";

let products = [];
let cart = [];
let selectedOngkir = 0;
let selectedPaymentMethod = 'cash';
let bluetoothCharacteristic = null;
let currentTransactionData = null;
let currentUser = null;

// ==========================================================================
// 2. SISTEM LOGIN & AUTHENTICATION
// ==========================================================================
async function prosesLogin() {
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;

    if (!u || !p) return alert("Isi username dan password!");

    try {
        // Menggunakan URLSearchParams untuk menghindari blokir CORS
        const formData = new URLSearchParams();
        formData.append('action', 'login');
        formData.append('username', u);
        formData.append('password', p);

        const res = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: formData
        });
        
        const data = await res.json();

        if (data.status === 'success') {
            currentUser = data;
            localStorage.setItem('pos_user', JSON.stringify(data));
            initApp();
        } else {
            alert(data.message);
        }
    } catch (e) {
        console.error(e);
        alert("Gagal koneksi ke server/Google Sheets.");
    }
}
function prosesLogout() {
    localStorage.removeItem('pos_user');
    location.reload();
}

function checkSession() {
    const saved = localStorage.getItem('pos_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        initApp();
    } else {
        document.getElementById('modal-login').classList.remove('hidden');
    }
}

function initApp() {
    document.getElementById('modal-login').classList.add('hidden');
    document.getElementById('app-content').classList.remove('hidden');

    document.getElementById('user-display-name').innerText = currentUser.name;
    document.getElementById('user-display-role').innerText = currentUser.role.toUpperCase();

    // Sembunyikan/Tampilkan Menu Khusus Admin
    if (currentUser.role === 'admin') {
        document.getElementById('nav-dash-btn').classList.remove('hidden');
        document.getElementById('nav-prod-btn').classList.remove('hidden');
        document.getElementById('nav-user-btn').classList.remove('hidden');
    }

    loadProductsFromAPI();
}

// ==========================================================================
// 3. FETCH & RENDER DATA DARIPADA GOOGLE SHEETS
// ==========================================================================
async function loadProductsFromAPI() {
    try {
        const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=getProducts`);
        products = await res.json();
        renderProducts(products);
    } catch (e) {
        console.error("Gagal muat produk:", e);
    }
}

function renderProducts(items) {
    const grid = document.getElementById('pos-product-grid');
    if (!grid) return;
    grid.innerHTML = items.map(p => `
        <div onclick="tambahKeKeranjang(${p.id})" class="bg-white p-2.5 rounded-2xl border border-[#D8D5C9] shadow-sm hover:border-primary cursor-pointer transition flex flex-col justify-between">
            <div class="h-28 bg-[#F9F8F5] rounded-xl overflow-hidden mb-2 relative flex justify-center items-center">
                <img src="${p.img}" onerror="this.src='https://via.placeholder.com/150?text=Lusty+Wealthy'" class="w-full h-full object-cover">
                <span class="absolute top-1 right-1 bg-stone-800/80 text-white text-[9px] px-1.5 py-0.5 rounded-md font-bold">Stok: ${p.stok}</span>
            </div>
            <div>
                <h4 class="font-serif font-bold text-xs text-primary leading-tight mb-1">${p.name}</h4>
                <p class="text-xs font-bold text-stone-700">Rp ${p.price.toLocaleString('id-ID')}</p>
            </div>
        </div>
    `).join('');
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-page').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(el => {
        if (el.dataset.tab === tabId) el.className = "nav-item flex flex-col items-center text-[10px] font-bold text-primary";
        else el.className = "nav-item flex flex-col items-center text-[10px] font-bold text-stone-400";
    });

    if (tabId === 'history') loadHistory();
    if (tabId === 'dashboard') loadDashboard();
    if (tabId === 'products') loadAdminProducts();
    if (tabId === 'users') loadAdminUsers();
}

// ==========================================================================
// 4. LOGIKA KASIR (KERANJANG & KALKULASI)
// ==========================================================================
function tambahKeKeranjang(id) {
    const item = products.find(p => p.id === id);
    if (!item) return;
    if (item.stok <= 0) return alert("Stok produk ini habis!");

    const index = cart.findIndex(c => c.id === id);
    if (index > -1) {
        if (cart[index].qty + 1 > item.stok) return alert("Jumlah melebihi stok yang ada!");
        cart[index].qty += 1;
    } else {
        cart.push({ ...item, qty: 1 });
    }
    updateCartUI();
}

function ubahQty(id, delta) {
    const index = cart.findIndex(c => c.id === id);
    const item = products.find(p => p.id === id);
    if (index > -1) {
        if (delta > 0 && cart[index].qty + 1 > item.stok) return alert("Stok tidak mencukupi!");
        cart[index].qty += delta;
        if (cart[index].qty <= 0) cart.splice(index, 1);
    }
    updateCartUI();
}

function setOngkir(val, targetBtn) {
    selectedOngkir = val;
    document.querySelectorAll('.ongkir-btn').forEach(b => {
        b.classList.remove('bg-primary', 'text-white');
        b.classList.add('bg-white', 'text-stone-700');
    });
    if (targetBtn) {
        targetBtn.classList.remove('bg-white', 'text-stone-700');
        targetBtn.classList.add('bg-primary', 'text-white');
    }
    hitungTotalAkhir();
}

function resetKeranjang() {
    cart = [];
    selectedOngkir = 0;
    document.getElementById('pos-customer-name').value = '';
    document.getElementById('pos-customer-wa').value = '';
    document.getElementById('pos-cash-received').value = '';
    document.getElementById('pos-cash-change').value = '0';
    document.getElementById('pos-discount-event').value = '0';
    pilihMetodeBayar('cash');
    updateCartUI();
}

function updateCartUI() {
    const cartContainer = document.getElementById('pos-cart-items');
    let totalQty = 0;

    if (cart.length === 0) {
        cartContainer.innerHTML = `<p class="text-xs text-stone-400 italic text-center py-6">Belum ada item dipilih.</p>`;
    } else {
        cartContainer.innerHTML = cart.map(item => {
            const subtotal = item.price * item.qty;
            totalQty += item.qty;
            return `
                <div class="flex justify-between items-center bg-[#F9F8F5] p-2 rounded-xl border border-[#D8D5C9]">
                    <div class="flex-1 pr-2">
                        <h5 class="text-xs font-bold text-primary">${item.name}</h5>
                        <p class="text-[10px] text-stone-500">Rp ${item.price.toLocaleString('id-ID')} x ${item.qty} = Rp ${subtotal.toLocaleString('id-ID')}</p>
                    </div>
                    <div class="flex items-center gap-1">
                        <button onclick="ubahQty(${item.id}, -1)" class="w-5 h-5 bg-white border font-bold rounded text-xs flex items-center justify-center">-</button>
                        <span class="text-xs font-bold px-1">${item.qty}</span>
                        <button onclick="ubahQty(${item.id}, 1)" class="w-5 h-5 bg-white border font-bold rounded text-xs flex items-center justify-center">+</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    document.getElementById('pos-total-qty-badge').innerText = totalQty;
    hitungTotalAkhir();
}

function getCalculatedTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    const percentDiskon = parseFloat(document.getElementById('pos-discount-event').value) || 0;
    const nominalDiskon = Math.round(subtotal * (percentDiskon / 100));
    const totalTagihan = Math.max(0, subtotal - nominalDiskon + selectedOngkir);
    const bagCount = Math.floor(totalQty / 10);

    return { subtotal, totalQty, percentDiskon, nominalDiskon, totalTagihan, bagCount };
}

function hitungTotalAkhir() {
    const totals = getCalculatedTotals();
    document.getElementById('pos-subtotal').innerText = "Rp " + totals.subtotal.toLocaleString('id-ID');
    document.getElementById('pos-diskon-event-text').innerText = "-Rp " + totals.nominalDiskon.toLocaleString('id-ID');
    document.getElementById('pos-ongkir-text').innerText = "Rp " + selectedOngkir.toLocaleString('id-ID');
    document.getElementById('pos-total-price').innerText = "Rp " + totals.totalTagihan.toLocaleString('id-ID');
    hitungKembalian();
}

function pilihMetodeBayar(method) {
    selectedPaymentMethod = method;
    if (method === 'cash') {
        document.getElementById('btn-pay-cash').className = "py-1.5 border border-primary bg-primary text-white font-bold rounded-xl text-xs";
        document.getElementById('btn-pay-qris').className = "py-1.5 border bg-white text-stone-700 font-bold rounded-xl text-xs";
        document.getElementById('cash-payment-section').classList.remove('hidden');
    } else {
        document.getElementById('btn-pay-qris').className = "py-1.5 border border-primary bg-primary text-white font-bold rounded-xl text-xs";
        document.getElementById('btn-pay-cash').className = "py-1.5 border bg-white text-stone-700 font-bold rounded-xl text-xs";
        document.getElementById('cash-payment-section').classList.add('hidden');
        
        const totals = getCalculatedTotals();
        if (totals.totalTagihan > 0) {
            document.getElementById('qris-modal-total').innerText = "Rp " + totals.totalTagihan.toLocaleString('id-ID');
            document.getElementById('modal-qris').classList.remove('hidden');
        }
    }
}

function tutupModalQris() { document.getElementById('modal-qris').classList.add('hidden'); }

function setNominalBayar(val) {
    const totals = getCalculatedTotals();
    document.getElementById('pos-cash-received').value = (val === 'pas') ? totals.totalTagihan : val;
    hitungKembalian();
}

function hitungKembalian() {
    if (selectedPaymentMethod === 'qris') return;
    const totals = getCalculatedTotals();
    const bayar = parseFloat(document.getElementById('pos-cash-received').value) || 0;
    const kembali = bayar - totals.totalTagihan;
    document.getElementById('pos-cash-change').value = kembali >= 0 ? kembali.toLocaleString('id-ID') : 'Uang Kurang';
}

// ==========================================================================
// 5. PREVIEW NOTA & SINKRONISASI PENGURANGAN STOK
// ==========================================================================
function bukaPreviewNota() {
    if (cart.length === 0) return alert("Keranjang belanja kosong!");

    const totals = getCalculatedTotals();
    let bayar = totals.totalTagihan;
    let kembali = 0;

    if (selectedPaymentMethod === 'cash') {
        bayar = parseFloat(document.getElementById('pos-cash-received').value) || 0;
        if (bayar < totals.totalTagihan) return alert("Uang pembayaran kurang!");
        kembali = bayar - totals.totalTagihan;
    }

    const notaId = "LW-" + Date.now().toString().slice(-6);
    const custName = document.getElementById('pos-customer-name').value.trim() || "Pelanggan Kasir";
    const custWa = document.getElementById('pos-customer-wa').value.trim() || "-";
    const poSlot = document.getElementById('pos-po-slot').value;

    currentTransactionData = {
        id: notaId,
        date: new Date().toLocaleString('id-ID'),
        customer: custName,
        wa: custWa,
        poSlot: poSlot,
        method: selectedPaymentMethod === 'cash' ? 'Tunai' : 'QRIS',
        subtotal: totals.subtotal,
        diskon: totals.nominalDiskon,
        percentDiskon: totals.percentDiskon,
        ongkir: selectedOngkir,
        total: totals.totalTagihan,
        bayar: bayar,
        kembali: kembali,
        bagCount: totals.bagCount,
        cart: [...cart]
    };

    document.getElementById('prev-date').innerText = currentTransactionData.date;
    document.getElementById('prev-id').innerText = currentTransactionData.id;
    document.getElementById('prev-customer').innerText = currentTransactionData.customer;
    document.getElementById('prev-wa').innerText = currentTransactionData.wa;
    document.getElementById('prev-po-slot').innerText = currentTransactionData.poSlot;
    document.getElementById('prev-method').innerText = currentTransactionData.method;
    document.getElementById('prev-subtotal').innerText = "Rp " + totals.subtotal.toLocaleString('id-ID');
    document.getElementById('prev-disc-event').innerText = "-Rp " + totals.nominalDiskon.toLocaleString('id-ID');
    document.getElementById('prev-ongkir').innerText = "Rp " + selectedOngkir.toLocaleString('id-ID');
    document.getElementById('prev-total').innerText = "Rp " + totals.totalTagihan.toLocaleString('id-ID');
    document.getElementById('prev-bayar').innerText = "Rp " + bayar.toLocaleString('id-ID');
    document.getElementById('prev-kembali').innerText = "Rp " + kembali.toLocaleString('id-ID');

    document.getElementById('prev-items-list').innerHTML = cart.map(i => `
        <div class="flex justify-between">
            <span>${i.name} x${i.qty}</span>
            <span>${(i.price * i.qty).toLocaleString('id-ID')}</span>
        </div>
    `).join('');

    document.getElementById('modal-preview-receipt').classList.remove('hidden');
}

function tutupPreviewNota() { document.getElementById('modal-preview-receipt').classList.add('hidden'); }

async function kirimKeGoogleSheets() {
    if (!currentTransactionData) return;

    const payload = {
        action: 'checkout',
        id: currentTransactionData.id,
        date: currentTransactionData.date,
        customer: currentTransactionData.customer,
        wa: currentTransactionData.wa,
        poSlot: currentTransactionData.poSlot,
        totalQty: currentTransactionData.cart.reduce((s, i) => s + i.qty, 0),
        totalPrice: currentTransactionData.total,
        paymentMethod: currentTransactionData.method,
        itemsDetail: currentTransactionData.cart.map(i => `${i.name} (${i.qty}x)`).join(', '),
        cartItems: currentTransactionData.cart.map(i => ({ id: i.id, qty: i.qty }))
    };

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        loadProductsFromAPI(); // Refresh data stok terbaru
    } catch (e) {
        console.error("Gagal sinkron:", e);
    }
}

async function kirimNotaWA() {
    await kirimKeGoogleSheets();
    const d = currentTransactionData;
    let text = `*--- NOTA TRANSAKSI LUSTY WEALTHY ---*\nNo: ${d.id}\nTgl: ${d.date}\nPelanggan: ${d.customer}\n\n*RINCIAN:*\n`;
    d.cart.forEach(i => { text += `• ${i.name} (x${i.qty}) = Rp ${(i.price * i.qty).toLocaleString('id-ID')}\n`; });
    text += `\n*TOTAL TAGIHAN: Rp ${d.total.toLocaleString('id-ID')}*\nTerima Kasih!`;

    let waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    if (d.wa && d.wa !== "-") {
        let cleanWA = d.wa.replace(/[^0-9]/g, '');
        if (cleanWA.startsWith('0')) cleanWA = '62' + cleanWA.slice(1);
        waUrl = `https://wa.me/${cleanWA}?text=${encodeURIComponent(text)}`;
    }
    window.open(waUrl, '_blank');
}

async function eksekusiCetak(type) {
    await kirimKeGoogleSheets();
    if (type === 'bluetooth') {
        if (!bluetoothCharacteristic) return alert("Printer BT Belum Terhubung!");
        kirimTeksKePrinterBT();
    } else {
        window.print();
        tutupPreviewNota();
        resetKeranjang();
    }
}

function downloadNotaJPG() {
    const area = document.getElementById('receipt-printable-area');
    html2canvas(area, { scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Nota_${currentTransactionData.id}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.click();
    });
}

// ==========================================================================
// 6. DASHBOARD & RIWAYAT (KHUSUS ADMIN/KASIR)
// ==========================================================================
async function loadHistory() {
    const container = document.getElementById('history-list-container');
    try {
        const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=getTransactions`);
        const data = await res.json();
        container.innerHTML = data.map(t => `
            <div class="bg-white p-3 rounded-xl border shadow-sm flex justify-between items-center text-xs">
                <div>
                    <h5 class="font-bold text-primary">${t.id} - ${t.customer}</h5>
                    <p class="text-[10px] text-stone-500">${t.date} | ${t.method}</p>
                    <p class="text-[10px] text-stone-700 italic mt-0.5">${t.items}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold text-sm text-primary">Rp ${t.totalPrice.toLocaleString('id-ID')}</p>
                </div>
            </div>
        `).join('');
    } catch (e) {
        container.innerHTML = `<p class="text-xs text-red-500 text-center py-4">Gagal memuat riwayat.</p>`;
    }
}

async function loadDashboard() {
    try {
        const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=getTransactions`);
        const data = await res.json();
        
        const omzet = data.reduce((s, i) => s + (i.totalPrice || 0), 0);
        const totalQty = data.reduce((s, i) => s + (i.totalQty || 0), 0);

        document.getElementById('dash-total-omzet').innerText = "Rp " + omzet.toLocaleString('id-ID');
        document.getElementById('dash-total-tx').innerText = data.length;
        document.getElementById('dash-total-qty').innerText = totalQty + " Botol";
    } catch (e) {}
}

async function loadAdminProducts() {
    const container = document.getElementById('admin-products-container');
    container.innerHTML = `
        <table class="w-full text-left text-xs">
            <thead class="bg-stone-100 border-b font-bold">
                <tr><th class="p-2.5">Produk</th><th class="p-2.5">Harga</th><th class="p-2.5">Stok</th></tr>
            </thead>
            <tbody>
                ${products.map(p => `
                    <tr class="border-b">
                        <td class="p-2.5 font-bold">${p.name}</td>
                        <td class="p-2.5">Rp ${p.price.toLocaleString('id-ID')}</td>
                        <td class="p-2.5"><span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">${p.stok}</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function loadAdminUsers() {
    const container = document.getElementById('admin-users-container');
    try {
        const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=getUsers`);
        const data = await res.json();
        container.innerHTML = `
            <table class="w-full text-left text-xs">
                <thead class="bg-stone-100 border-b font-bold">
                    <tr><th class="p-2.5">Nama</th><th class="p-2.5">Username</th><th class="p-2.5">Role</th></tr>
                </thead>
                <tbody>
                    ${data.map(u => `
                        <tr class="border-b">
                            <td class="p-2.5 font-bold">${u.name}</td>
                            <td class="p-2.5">${u.username}</td>
                            <td class="p-2.5 uppercase font-bold text-primary">${u.role}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {}
}

// Inisialisasi awal saat aplikasi dijalankan
checkSession();
