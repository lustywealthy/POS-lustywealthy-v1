/// ==========================================================================
// FUNGSI SINKRONISASI OTOMATIS KE GOOGLE SPREADSHEET
// ==========================================================================

async function kirimKeGoogleSheets() {
    // Cek apakah URL Apps Script sudah diisi
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === "") {
        console.warn("URL Google Apps Script belum dikonfigurasi.");
        return;
    }

    if (!currentTransactionData) return;

    // Hitung total kuantitas botol dan ringkasan nama item
    const totalQty = currentTransactionData.cart.reduce((sum, item) => sum + item.qty, 0);
    const itemsSummary = currentTransactionData.cart.map(item => `${item.name} (${item.qty}x)`).join(', ');

    // Format data yang dikirim ke Google Sheets
    const payload = {
        id: currentTransactionData.id,
        date: currentTransactionData.date,
        customer: currentTransactionData.customer,
        wa: currentTransactionData.wa,
        poSlot: currentTransactionData.poSlot,
        totalQty: totalQty,
        totalPrice: currentTransactionData.total,
        paymentMethod: currentTransactionData.method,
        itemsDetail: itemsSummary
    };

    try {
        // Mengirimkan data via HTTP POST
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Mencegah error CORS di browser
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        console.log("✅ Data transaksi berhasil dikirim ke Google Spreadsheet!");
    } catch (error) {
        console.error("❌ Gagal mengirim data ke Google Sheets:", error);
        alert("Gagal menghubungkan ke Google Sheets. Pastikan koneksi internet stabil.");
    }
}
// Master Daftar Produk
const products = [
    { id: 1, name: "Ginger Original", price: 10000, category: "jahe", img: "asset/ginger-ori.png" },
    { id: 2, name: "Ginger Latte", price: 12000, category: "jahe", img: "asset/ginger-latte.png" },
    { id: 3, name: "Black Coffee Cold Brew", price: 18000, category: "kopi", img: "asset/black-coffee.png" },
    { id: 4, name: "White Coffee Cold Brew", price: 22000, category: "kopi", img: "asset/white-coffee.png" },
    { id: 5, name: "Palm Sugar Cold Brew", price: 22000, category: "kopi", img: "asset/palm-sugar.png" },
    { id: 6, name: "Signature Chocolate", price: 18000, category: "non-kopi", img: "asset/signature-choco.png" }
];

// Variable Penyimpanan Sementara (State)
let cart = [];
let selectedOngkir = 0;
let selectedPaymentMethod = 'cash';
let bluetoothCharacteristic = null;
let currentTransactionData = null;

// ==========================================================================
// 2. RENDERING KATALOG & FILTER PRODUK
// ==========================================================================

// Menampilkan produk ke grid HTML
function renderProducts(items) {
    const grid = document.getElementById('pos-product-grid');
    if (!grid) return;
    grid.innerHTML = items.map(p => `
        <div onclick="tambahKeKeranjang(${p.id})" class="bg-white p-3 rounded-2xl border border-[#D8D5C9] shadow-sm hover:border-primary cursor-pointer transition flex flex-col justify-between active:scale-95">
            <div class="h-36 sm:h-40 bg-[#F9F8F5] rounded-xl overflow-hidden mb-2 border border-[#F0EEE6] relative flex justify-center items-center">
                <img src="${p.img}" onerror="this.src='https://via.placeholder.com/150?text=Lusty+Wealthy'" class="w-full h-full object-cover">
            </div>
            <div>
                <h4 class="font-serif font-bold text-xs text-primary leading-tight mb-1">${p.name}</h4>
                <p class="text-xs font-bold text-stone-700">Rp ${p.price.toLocaleString('id-ID')}</p>
            </div>
        </div>
    `).join('');
}

// Filter berdasarkan Kategori
function filterKategori(cat, targetBtn) {
    document.querySelectorAll('.cat-btn').forEach(b => {
        b.classList.remove('bg-primary', 'text-white');
        b.classList.add('bg-white', 'text-primary');
    });
    if (targetBtn) {
        targetBtn.classList.remove('bg-white', 'text-primary');
        targetBtn.classList.add('bg-primary', 'text-white');
    }

    if (cat === 'semua') renderProducts(products);
    else renderProducts(products.filter(p => p.category === cat));
}

// ==========================================================================
// 3. LOGIKA KERANJANG BELANJA
// ==========================================================================

function tambahKeKeranjang(id) {
    const item = products.find(p => p.id === id);
    const index = cart.findIndex(c => c.id === id);
    if (index > -1) cart[index].qty += 1;
    else cart.push({ ...item, qty: 1 });
    updateCartUI();
}

function ubahQty(id, delta) {
    const index = cart.findIndex(c => c.id === id);
    if (index > -1) {
        cart[index].qty += delta;
        if (cart[index].qty <= 0) cart.splice(index, 1);
    }
    updateCartUI();
}

function setOngkir(val, targetBtn) {
    selectedOngkir = val;
    document.querySelectorAll('.ongkir-btn').forEach(b => {
        b.classList.remove('bg-primary', 'text-white', 'border-primary');
        b.classList.add('bg-white', 'text-stone-700', 'border-[#D8D5C9]');
    });
    if (targetBtn) {
        targetBtn.classList.remove('bg-white', 'text-stone-700', 'border-[#D8D5C9]');
        targetBtn.classList.add('bg-primary', 'text-white', 'border-primary');
    }
    hitungTotalAkhir();
}

function resetKeranjang() {
    cart = [];
    selectedOngkir = 0;
    
    const custName = document.getElementById('pos-customer-name');
    const custWa = document.getElementById('pos-customer-wa');
    const cashRec = document.getElementById('pos-cash-received');
    const cashChg = document.getElementById('pos-cash-change');
    const discInput = document.getElementById('pos-discount-event');
    const poSlot = document.getElementById('pos-po-slot');

    if (custName) custName.value = '';
    if (custWa) custWa.value = '';
    if (cashRec) cashRec.value = '';
    if (cashChg) cashChg.value = '0';
    if (discInput) discInput.value = '0';
    if (poSlot) poSlot.value = 'Langsung (Non-PO)';

    pilihMetodeBayar('cash');
    updateCartUI();
}

function updateCartUI() {
    const cartContainer = document.getElementById('pos-cart-items');
    let totalQty = 0;

    if (!cartContainer) return;

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

    const badge = document.getElementById('pos-total-qty-badge');
    if (badge) badge.innerText = totalQty;
    
    // Promo Bonus Thermal Bag (Kelipatan 10 Botol)
    const bagCount = Math.floor(totalQty / 10);
    const bagBanner = document.getElementById('thermal-bag-banner');
    const bagText = document.getElementById('thermal-bag-text');
    if (bagBanner && bagText) {
        if (bagCount > 0) {
            bagText.innerText = `Selamat! Gratis ${bagCount} Thermal Bag`;
            bagBanner.classList.remove('hidden');
        } else {
            bagBanner.classList.add('hidden');
        }
    }

    hitungTotalAkhir();
}

// Menghitung Kalkulasi Tagihan & Diskon
function getCalculatedTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    
    const discInputElem = document.getElementById('pos-discount-event');
    const percentDiskon = discInputElem ? (parseFloat(discInputElem.value) || 0) : 0;
    const nominalDiskon = Math.round(subtotal * (percentDiskon / 100));

    const totalTagihan = Math.max(0, subtotal - nominalDiskon + selectedOngkir);
    const bagCount = Math.floor(totalQty / 10);

    return { subtotal, totalQty, percentDiskon, nominalDiskon, totalTagihan, bagCount };
}

function hitungTotalAkhir() {
    const totals = getCalculatedTotals();

    const subtotalElem = document.getElementById('pos-subtotal');
    const diskonElem = document.getElementById('pos-diskon-event-text');
    const ongkirElem = document.getElementById('pos-ongkir-text');
    const totalPriceElem = document.getElementById('pos-total-price');

    if (subtotalElem) subtotalElem.innerText = "Rp " + totals.subtotal.toLocaleString('id-ID');
    if (diskonElem) diskonElem.innerText = "-Rp " + totals.nominalDiskon.toLocaleString('id-ID');
    if (ongkirElem) ongkirElem.innerText = "Rp " + selectedOngkir.toLocaleString('id-ID');
    if (totalPriceElem) totalPriceElem.innerText = "Rp " + totals.totalTagihan.toLocaleString('id-ID');

    hitungKembalian();
}

function pilihMetodeBayar(method) {
    selectedPaymentMethod = method;
    const btnCash = document.getElementById('btn-pay-cash');
    const btnQris = document.getElementById('btn-pay-qris');
    const cashSection = document.getElementById('cash-payment-section');

    if (method === 'cash') {
        if (btnCash) btnCash.className = "py-2 px-3 border border-primary bg-primary text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition";
        if (btnQris) btnQris.className = "py-2 px-3 border border-[#D8D5C9] bg-white text-stone-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition";
        if (cashSection) cashSection.classList.remove('hidden');
    } else {
        if (btnQris) btnQris.className = "py-2 px-3 border border-primary bg-primary text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition";
        if (btnCash) btnCash.className = "py-2 px-3 border border-[#D8D5C9] bg-white text-stone-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition";
        if (cashSection) cashSection.classList.add('hidden');
        
        const totals = getCalculatedTotals();
        if (totals.totalTagihan > 0) {
            const qrisTotal = document.getElementById('qris-modal-total');
            if (qrisTotal) qrisTotal.innerText = "Rp " + totals.totalTagihan.toLocaleString('id-ID');
            const qrisModal = document.getElementById('modal-qris');
            if (qrisModal) qrisModal.classList.remove('hidden');
        }
    }
}

function tutupModalQris() {
    const qrisModal = document.getElementById('modal-qris');
    if (qrisModal) qrisModal.classList.add('hidden');
}

function setNominalBayar(val) {
    const totals = getCalculatedTotals();
    const recInput = document.getElementById('pos-cash-received');
    if (recInput) {
        recInput.value = (val === 'pas') ? totals.totalTagihan : val;
    }
    hitungKembalian();
}

function hitungKembalian() {
    if (selectedPaymentMethod === 'qris') return;
    const totals = getCalculatedTotals();
    const recInput = document.getElementById('pos-cash-received');
    const chgInput = document.getElementById('pos-cash-change');
    const bayar = recInput ? (parseFloat(recInput.value) || 0) : 0;
    const kembali = bayar - totals.totalTagihan;
    
    if (chgInput) {
        chgInput.value = kembali >= 0 ? kembali.toLocaleString('id-ID') : 'Uang Kurang';
    }
}

// ==========================================================================
// 4. PREVIEW NOTA & SINKRONISASI GOOGLE SHEETS
// ==========================================================================

function bukaPreviewNota() {
    if (cart.length === 0) return alert("Keranjang belanja masih kosong!");

    const totals = getCalculatedTotals();
    let bayar = totals.totalTagihan;
    let kembali = 0;

    if (selectedPaymentMethod === 'cash') {
        const recInput = document.getElementById('pos-cash-received');
        bayar = recInput ? (parseFloat(recInput.value) || 0) : 0;
        if (bayar < totals.totalTagihan) return alert("Nominal pembayaran uang tunai masih kurang!");
        kembali = bayar - totals.totalTagihan;
    }

    const notaId = "LW-" + Date.now().toString().slice(-6);
    const custNameInput = document.getElementById('pos-customer-name');
    const custWaInput = document.getElementById('pos-customer-wa');
    const poSlotInput = document.getElementById('pos-po-slot');

    const customerName = custNameInput && custNameInput.value.trim() ? custNameInput.value.trim() : "Pelanggan Kasir";
    const customerWA = custWaInput && custWaInput.value.trim() ? custWaInput.value.trim() : "-";
    const poSlot = poSlotInput ? poSlotInput.value : "Langsung (Non-PO)";

    currentTransactionData = {
        id: notaId,
        date: new Date().toLocaleString('id-ID'),
        customer: customerName,
        wa: customerWA,
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

    // Render data ke elemen Modal Preview
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

    const bonusElem = document.getElementById('prev-bonus-bag');
    if (bonusElem) {
        if (totals.bagCount > 0) {
            document.getElementById('prev-bag-count').innerText = totals.bagCount;
            bonusElem.classList.remove('hidden');
        } else {
            bonusElem.classList.add('hidden');
        }
    }

    document.getElementById('prev-items-list').innerHTML = cart.map(i => `
        <div class="flex justify-between">
            <span>${i.name} x${i.qty}</span>
            <span>${(i.price * i.qty).toLocaleString('id-ID')}</span>
        </div>
    `).join('');

    document.getElementById('modal-preview-receipt').classList.remove('hidden');
}

function tutupPreviewNota() {
    document.getElementById('modal-preview-receipt').classList.add('hidden');
}

// Kirim Teks Nota ke WA Pelanggan & Trigger Auto Sync Google Sheets
function kirimNotaWA() {
    if (!currentTransactionData) return;
    const d = currentTransactionData;

    // Trigger Sinkronisasi ke Google Sheets Otomatis
    kirimKeGoogleSheets();

    let text = `*--- NOTA TRANSAKSI LUSTY WEALTHY ---*\n`;
    text += `No. Nota : ${d.id}\n`;
    text += `Tanggal  : ${d.date}\n`;
    text += `Pelanggan: ${d.customer}\n`;
    text += `Slot PO  : ${d.poSlot}\n`;
    text += `Metode   : ${d.method}\n`;
    text += `------------------------------------------\n`;
    text += `*RINCIAN ITEM:*\n`;
    
    d.cart.forEach(i => {
        text += `• ${i.name} (x${i.qty}) = Rp ${(i.price * i.qty).toLocaleString('id-ID')}\n`;
    });

    text += `------------------------------------------\n`;
    text += `Subtotal  : Rp ${d.subtotal.toLocaleString('id-ID')}\n`;
    if (d.diskon > 0) text += `Diskon (${d.percentDiskon}%): -Rp ${d.diskon.toLocaleString('id-ID')}\n`;
    if (d.ongkir > 0) text += `Ongkir    : Rp ${d.ongkir.toLocaleString('id-ID')}\n`;
    text += `*TOTAL TAGIHAN : Rp ${d.total.toLocaleString('id-ID')}*\n`;
    text += `Bayar     : Rp ${d.bayar.toLocaleString('id-ID')}\n`;
    text += `Kembali   : Rp ${d.kembali.toLocaleString('id-ID')}\n`;
    if (d.bagCount > 0) text += `*BONUS: ${d.bagCount} FREE THERMAL BAG*\n`;
    text += `------------------------------------------\n`;
    text += `Terima kasih telah berbelanja di Lusty Wealthy! 🌿`;

    let waUrl = `https://wa.me/`;
    if (d.wa && d.wa !== "-") {
        let cleanWA = d.wa.replace(/[^0-9]/g, '');
        if (cleanWA.startsWith('0')) cleanWA = '62' + cleanWA.slice(1);
        waUrl += `${cleanWA}?text=${encodeURIComponent(text)}`;
    } else {
        waUrl += `?text=${encodeURIComponent(text)}`;
    }

    window.open(waUrl, '_blank');
}

// Download Gambar Nota Thermal (.JPG)
function downloadNotaJPG() {
    const area = document.getElementById('receipt-printable-area');
    if (!area) return;
    html2canvas(area, { scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Nota_${currentTransactionData.id}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.click();
    });
}

// Cetak & Auto Sync Google Sheets
async function eksekusiCetak(type) {
    if (!currentTransactionData) return;

    // Trigger Sinkronisasi ke Google Sheets Otomatis
    kirimKeGoogleSheets();

    if (type === 'bluetooth') {
        if (!bluetoothCharacteristic) {
            alert("Printer Bluetooth belum terhubung!");
            return;
        }
        kirimTeksKePrinterBT();
    } else {
        window.print();
        tutupPreviewNota();
        resetKeranjang();
    }
}

// Fungsi utama mengirimkan data rekapan ke Google Spreadsheet via Fetch API[cite: 1]
async function kirimKeGoogleSheets() {
    if (!GOOGLE_SCRIPT_URL || !currentTransactionData) return;

    const totalQty = currentTransactionData.cart.reduce((s, i) => s + i.qty, 0);
    const itemsSummary = currentTransactionData.cart.map(i => `${i.name} (x${i.qty})`).join(', ');

    const payload = {
        id: currentTransactionData.id,
        date: currentTransactionData.date,
        customer: currentTransactionData.customer,
        wa: currentTransactionData.wa,
        poSlot: currentTransactionData.poSlot,
        totalQty: totalQty,
        totalPrice: currentTransactionData.total,
        paymentMethod: currentTransactionData.method,
        itemsDetail: itemsSummary
    };

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        console.log("Data penjualan berhasil terkirim ke Google Sheets!");
    } catch (e) {
        console.error("Gagal mengirim data ke Google Sheets:", e);
    }
}

// ==========================================================================
// 5. PRINTER BLUETOOTH THERMAL
// ==========================================================================

async function connectBluetoothPrinter() {
    try {
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
            optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
        });
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
        bluetoothCharacteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
        
        const statusText = document.getElementById('bt-status-text');
        const btnBt = document.getElementById('btn-connect-bt');
        if (statusText) statusText.innerText = 'BT Connected';
        if (btnBt) btnBt.classList.replace('bg-blue-600', 'bg-emerald-600');
        alert('Printer Bluetooth terhubung!');
    } catch (err) {
        alert('Gagal menghubungkan Printer Bluetooth.');
    }
}

function kirimTeksKePrinterBT() {
    const d = currentTransactionData;
    let text = "";
    text += "      LUSTY WEALTHY\n";
    text += " Breathe slow, eat well, live light\n";
    text += "--------------------------------\n";
    text += "Tgl : " + d.date + "\n";
    text += "Nota: " + d.id + "\n";
    text += "Plg : " + d.customer + "\n";
    text += "PO  : " + d.poSlot + "\n";
    text += "Byr : " + d.method + "\n";
    text += "--------------------------------\n";
    
    d.cart.forEach(i => {
        text += i.name + "\n";
        text += "  " + i.qty + " x " + i.price + " = " + (i.price * i.qty) + "\n";
    });
    
    text += "--------------------------------\n";
    text += "Subtotal: Rp " + d.subtotal + "\n";
    if (d.diskon > 0) text += "Diskon  : -Rp " + d.diskon + "\n";
    if (d.ongkir > 0) text += "Ongkir  : Rp " + d.ongkir + "\n";
    text += "TOTAL   : Rp " + d.total + "\n";
    text += "Bayar   : Rp " + d.bayar + "\n";
    text += "Kembali : Rp " + d.kembali + "\n";
    if (d.bagCount > 0) text += "FREE " + d.bagCount + " THERMAL BAG\n";
    text += "--------------------------------\n";
    text += "  Terima Kasih Atas Kunjungannya!\n";
    text += "   Instagram: @lusty_wealthy\n\n\n\n";

    let encoder = new TextEncoder();
    bluetoothCharacteristic.writeValue(encoder.encode(text))
        .then(() => {
            alert("Nota berhasil dicetak ke printer Bluetooth!");
            tutupPreviewNota();
            resetKeranjang();
        })
        .catch(err => alert("Gagal kirim data ke printer: " + err));
}

// Inisialisasi awal saat web dibuka
renderProducts(products);
