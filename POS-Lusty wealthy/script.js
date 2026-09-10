/* ==========================================================================
   POS KASIR & PEMBUKUAN LABA RUGI - LUSTY WEALTHY
   ========================================================================== */

// 1. Konfigurasi URL Google Apps Script kamu
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw6zQJTgUxOU3LiNumB_D-2hq2J82ExFl07a68bzQZ405ZTxr3Uo5dU00v4--0e2Lk2NQ/exec"; // Ganti dengan URL /exec kamu

// 2. Master Data Produk (Lengkap dengan HPP / Modal Pokok)
const PRODUCTS = [
    { id: 1, name: "Jahe Merah Original", price: 15000, hpp: 6000, cat: "jahe" },
    { id: 2, name: "Ginger Latte", price: 18000, hpp: 7000, cat: "jahe" },
    { id: 3, name: "Cold Brew Kopi Susu", price: 20000, hpp: 8500, cat: "kopi" },
    { id: 4, name: "Cold Brew Black", price: 18000, hpp: 6500, cat: "kopi" },
    { id: 5, name: "Artisan Tea Chamomile", price: 12000, hpp: 4000, cat: "non-kopi" }
];

// State Aplikasi
let cart = [];
let transactions = JSON.parse(localStorage.getItem("lw_transactions") || "[]");
let bluetoothDevice = null;

// Parameter Biaya Operasional (Bisa disesuaikan)
const BIAYA_MITRA_PCT = 0.05; // Contoh: 5% dari omzet untuk mitra/kurir
const PENYUSUTAN_PER_TRANSAKSI = 500; // Rp 500 disisihkan per transaksi untuk penyusutan alat

// INITALIZATION
document.addEventListener("DOMContentLoaded", () => {
    renderProducts("semua");
    renderCart();
    renderLaporan();
});

/* ==========================================================================
   FUNGSI TAB & RENDER PRODUK
   ========================================================================== */
function switchTab(tab) {
    document.getElementById("view-pos").classList.toggle("hidden", tab !== "pos");
    document.getElementById("view-pembukuan").classList.toggle("hidden", tab !== "pembukuan");
    
    document.getElementById("tab-btn-pos").className = tab === "pos" ? "px-3 py-1.5 text-xs font-bold rounded-lg bg-primary text-white" : "px-3 py-1.5 text-xs font-bold rounded-lg bg-gray-200 text-gray-700";
    document.getElementById("tab-btn-pembukuan").className = tab === "pembukuan" ? "px-3 py-1.5 text-xs font-bold rounded-lg bg-primary text-white" : "px-3 py-1.5 text-xs font-bold rounded-lg bg-gray-200 text-gray-700";
    
    if (tab === "pembukuan") renderLaporan();
}

function renderProducts(kategori) {
    const grid = document.getElementById("product-grid");
    grid.innerHTML = "";

    const filtered = kategori === "semua" ? PRODUCTS : PRODUCTS.filter(p => p.cat === kategori);

    filtered.forEach(p => {
        grid.innerHTML += `
            <div onclick="addToCart(${p.id})" class="bg-white border border-[#D8D5C9] p-3 rounded-xl cursor-pointer hover:border-primary transition shadow-sm flex flex-col justify-between">
                <div>
                    <h3 class="font-bold text-xs text-slate-800 leading-tight">${p.name}</h3>
                    <p class="text-[10px] text-slate-400 mt-0.5">HPP: Rp ${p.hpp.toLocaleString('id-ID')}</p>
                </div>
                <div class="mt-3 flex justify-between items-center">
                    <span class="text-xs font-bold text-primary">Rp ${p.price.toLocaleString('id-ID')}</span>
                    <span class="bg-bgLight text-primary text-[10px] px-2 py-1 rounded-md font-bold">+ Tambah</span>
                </div>
            </div>
        `;
    });
}

function filterKategori(cat) {
    renderProducts(cat);
}

/* ==========================================================================
   FUNGSI KERANJANG BELANJA (CART)
   ========================================================================== */
function addToCart(productId) {
    const product = PRODUCTS.find(p => p.id === productId);
    const exist = cart.find(item => item.id === productId);

    if (exist) {
        exist.qty += 1;
    } else {
        cart.push({ ...product, qty: 1 });
    }
    renderCart();
}

function updateQty(productId, delta) {
    const item = cart.find(i => i.id === productId);
    if (item) {
        item.qty += delta;
        if (item.qty <= 0) {
            cart = cart.filter(i => i.id !== productId);
        }
    }
    renderCart();
}

function clearCart() {
    cart = [];
    renderCart();
}

function renderCart() {
    const container = document.getElementById("cart-items");
    const totalEl = document.getElementById("cart-total");

    if (cart.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">Keranjang masih kosong</p>`;
        totalEl.innerText = "Rp 0";
        return;
    }

    container.innerHTML = "";
    let totalOmzet = 0;

    cart.forEach(item => {
        const itemTotal = item.price * item.qty;
        totalOmzet += itemTotal;

        container.innerHTML += `
            <div class="flex justify-between items-center text-xs bg-bgLight p-2 rounded-lg">
                <div class="flex-1 pr-2">
                    <p class="font-bold text-slate-800">${item.name}</p>
                    <p class="text-[10px] text-slate-500">Rp ${item.price.toLocaleString('id-ID')} x ${item.qty}</p>
                </div>
                <div class="flex items-center gap-1.5">
                    <button onclick="updateQty(${item.id}, -1)" class="w-5 h-5 bg-white border font-bold rounded flex items-center justify-center">-</button>
                    <span class="font-bold w-4 text-center">${item.qty}</span>
                    <button onclick="updateQty(${item.id}, 1)" class="w-5 h-5 bg-white border font-bold rounded flex items-center justify-center">+</button>
                </div>
            </div>
        `;
    });

    totalEl.innerText = `Rp ${totalOmzet.toLocaleString('id-ID')}`;
}

/* ==========================================================================
   PROSES TRANSAKSI & PEMBUKUAN OTOMATIS
   ========================================================================== */
function processCheckout(outputType) {
    if (cart.length === 0) return alert("Keranjang belanja masih kosong!");

    const custName = document.getElementById("cust-name").value || "Pelanggan Umum";
    const custWA = document.getElementById("cust-wa").value || "-";
    const payMethod = document.getElementById("payment-method").value;

    // Kalkulasi Angka Pembukuan
    let totalQty = 0;
    let totalOmzet = 0;
    let totalHPP = 0;
    let itemsDetailArr = [];

    cart.forEach(i => {
        totalQty += i.qty;
        totalOmzet += (i.price * i.qty);
        totalHPP += (i.hpp * i.qty);
        itemsDetailArr.push(`${i.name} (${i.qty}x)`);
    });

    const labaKotor = totalOmzet - totalHPP;
    const biayaMitra = Math.round(totalOmzet * BIAYA_MITRA_PCT);
    const penyusutan = PENYUSUTAN_PER_TRANSAKSI;
    const labaBersih = labaKotor - (biayaMitra + penyusutan);

    const transactionData = {
        id: "LW-" + Date.now().toString().slice(-6),
        date: new Date().toLocaleString("id-ID"),
        timestamp: new Date().getTime(),
        customer: custName,
        whatsapp: custWA,
        totalQty: totalQty,
        totalOmzet: totalOmzet,
        totalHPP: totalHPP,
        labaKotor: labaKotor,
        biayaMitra: biayaMitra,
        penyusutan: penyusutan,
        labaBersih: labaBersih,
        paymentMethod: payMethod,
        itemsDetail: itemsDetailArr.join(", ")
    };

    // 1. Simpan ke database lokal
    transactions.unshift(transactionData);
    localStorage.setItem("lw_transactions", JSON.stringify(transactions));

    // 2. Kirim Sinkronisasi ke Google Sheets API
    syncToGoogleSheets(transactionData);

    // 3. Proses Output (Nota WhatsApp atau Print Thermal)
    if (outputType === 'WA') {
        sendToWhatsApp(transactionData);
    } else {
        printReceipt(transactionData);
    }

    // Reset Form
    clearCart();
    document.getElementById("cust-name").value = "";
    document.getElementById("cust-wa").value = "";
    alert("Transaksi berhasil diproses & dicatat!");
}

/* ==========================================================================
   INTEGRASI API GOOGLE SHEETS & WHATSAPP
   ========================================================================== */
function syncToGoogleSheets(data) {
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("AKfycb...")) return;

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    }).catch(err => console.error("Gagal sinkron Google Sheets:", err));
}

function sendToWhatsApp(data) {
    let msg = `*NOTA PEMBELIAN - LUSTY WEALTHY*\n`;
    msg += `ID: ${data.id}\n`;
    msg += `Tanggal: ${data.date}\n`;
    msg += `Pelanggan: ${data.customer}\n`;
    msg += `-----------------------------------\n`;
    cart.forEach(i => {
        msg += `${i.name} x${i.qty} = Rp ${(i.price * i.qty).toLocaleString('id-ID')}\n`;
    });
    msg += `-----------------------------------\n`;
    msg += `*Total Tagihan: Rp ${data.totalOmzet.toLocaleString('id-ID')}*\n`;
    msg += `Metode Bayar: ${data.paymentMethod}\n\n`;
    msg += `Terima kasih telah berbelanja produk sehat Lusty Wealthy! 🌿`;

    const targetPhone = data.whatsapp !== "-" ? data.whatsapp : "";
    window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ==========================================================================
   PRINTER BLUETOOTH & PRINT SYSTEM
   ========================================================================== */
async function connectBluetoothPrinter() {
    try {
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
        });
        alert("Printer BT Terhubung: " + bluetoothDevice.name);
    } catch (err) {
        alert("Gagal menghubungkan Bluetooth Printer / Tidak Didukung Browser.");
    }
}

function printReceipt(data) {
    const printableArea = document.getElementById("receipt-printable-area");
    printableArea.innerHTML = `
        <div style="text-align: center; font-weight: bold;">LUSTY WEALTHY</div>
        <div style="text-align: center;">Minuman Herbal & Cold Brew</div>
        <div>--------------------------------</div>
        <div>ID   : ${data.id}</div>
        <div>Tgl  : ${data.date}</div>
        <div>Nama : ${data.customer}</div>
        <div>--------------------------------</div>
        ${cart.map(i => `<div>${i.name}<br>${i.qty} x ${i.price} = ${i.qty * i.price}</div>`).join('')}
        <div>--------------------------------</div>
        <div style="font-weight:bold;">TOTAL : Rp ${data.totalOmzet.toLocaleString('id-ID')}</div>
        <div>Bayar : ${data.paymentMethod}</div>
        <div>--------------------------------</div>
        <div style="text-align: center;">Terima Kasih!</div>
    `;
    window.print();
}

/* ==========================================================================
   LAPORAN LABA RUGI & REKAP MINGGUAN/BULANAN
   ========================================================================== */
function renderLaporan() {
    const filter = document.getElementById("filter-periode").value;
    const now = new Date();
    
    let filteredData = transactions.filter(t => {
        const tDate = new Date(t.timestamp);
        if (filter === "minggu") {
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            return tDate >= oneWeekAgo;
        } else if (filter === "bulan") {
            return tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear();
        }
        return true;
    });

    // Hitung Stat Pembukuan
    let totalOmzet = 0, totalHPP = 0, totalMitra = 0, totalPenyusutan = 0, totalLabaBersih = 0;

    const tableBody = document.getElementById("table-pembukuan-body");
    tableBody.innerHTML = "";

    filteredData.forEach(t => {
        totalOmzet += t.totalOmzet;
        totalHPP += t.totalHPP;
        totalMitra += t.biayaMitra;
        totalPenyusutan += t.penyusutan;
        totalLabaBersih += t.labaBersih;

        tableBody.innerHTML += `
            <tr class="hover:bg-slate-50">
                <td class="p-2.5 font-bold">${t.id}<br><span class="text-[10px] text-slate-400 font-normal">${t.date}</span></td>
                <td class="p-2.5">${t.customer}</td>
                <td class="p-2.5 text-[11px] text-slate-600">${t.itemsDetail}</td>
                <td class="p-2.5 font-semibold text-primary">Rp ${t.totalOmzet.toLocaleString('id-ID')}</td>
                <td class="p-2.5 text-amber-600">Rp ${t.totalHPP.toLocaleString('id-ID')}</td>
                <td class="p-2.5 font-bold text-emerald-600">Rp ${t.labaBersih.toLocaleString('id-ID')}</td>
                <td class="p-2.5"><span class="bg-gray-100 px-2 py-0.5 rounded text-[10px]">${t.paymentMethod}</span></td>
            </tr>
        `;
    });

    // Update UI Stats
    document.getElementById("stat-omzet").innerText = `Rp ${totalOmzet.toLocaleString('id-ID')}`;
    document.getElementById("stat-hpp").innerText = `Rp ${totalHPP.toLocaleString('id-ID')}`;
    document.getElementById("stat-mitra").innerText = `Rp ${totalMitra.toLocaleString('id-ID')}`;
    document.getElementById("stat-penyusutan").innerText = `Rp ${totalPenyusutan.toLocaleString('id-ID')}`;
    document.getElementById("stat-laba-bersih").innerText = `Rp ${totalLabaBersih.toLocaleString('id-ID')}`;
}
