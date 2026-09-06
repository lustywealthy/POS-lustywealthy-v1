// ==========================================================================
// FUNGSI SINKRONISASI OTOMATIS KE GOOGLE SPREADSHEET
// ==========================================================================

async function kirimKeGoogleSheets() {
    // Cek apakah URL Apps Script sudah diisi
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === "https://script.google.com/macros/s/AKfycbxdMHGGNf_5mkxzUjKYDxYfY63G7QF_YIDsbCdfvpGacKH-cNvQw2cGt5YIUZVho2mO/exec") {
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
