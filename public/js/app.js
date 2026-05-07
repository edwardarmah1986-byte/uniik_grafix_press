    <script>

      function rebuildMaterialRolls() {

        db.all(`SELECT * FROM materials`, (err, materials) => {

          if (err) {
            console.error("❌ Error loading materials:", err);
            return;
          }

          materials.forEach(mat => {

            db.get(`
              SELECT COUNT(*) as count 
              FROM material_rolls 
              WHERE material_id = ?
            `, [mat.id], (err, row) => {

              if (err) return;

              // 🔥 ONLY FIX OLD MATERIALS
              if (row.count === 0 && mat.quantity > 0) {

                const area = calculateMaterialArea(mat.size);

                if (area <= 0) {
                  console.warn("⚠️ Invalid size for", mat.name);
                  return;
                }

                for (let i = 0; i < mat.quantity; i++) {

                  db.run(`
                    INSERT INTO material_rolls 
                    (material_id, total_area, remaining_area, created_at)
                    VALUES (?, ?, ?, datetime('now'))
                  `, [mat.id, area, area]);
                }

                console.log(`♻️ Rebuilt rolls for ${mat.name}`);
              }

            });

          });

        });
      }

      function calculateMaterialArea(sizeText) {
        if (!sizeText) return 0;

        const cleaned = sizeText.toLowerCase().replace(/\s/g, '');

        const match = cleaned.match(/(\d+)(ft|m)?x(\d+)(ft|m)?/);

        if (!match) return 0;

        let w = Number(match[1]);
        let h = Number(match[3]);

        let wUnit = match[2] || 'ft';
        let hUnit = match[4] || 'm';

        // convert everything to feet
        if (wUnit === 'm') w *= 3.281;
        if (hUnit === 'm') h *= 3.281;

        return w * h;
      }

      function setText(id, value) {
        const el = document.getElementById(id);

        if (!el) {
          console.warn(`⚠️ Element not found: ${id}`);
          return;
        }

        el.innerText = value;
      }

      function formatMoney(value) {
        return "GHS " + Number(value || 0).toFixed(2);
      }

      function calculateProfit(price, cost) {
        return (Number(price) || 0) - (Number(cost) || 0);
      }

      // 🧾 COST % PER MATERIAL
      const materialCost = {
        banner: 0.35,
        sticker: 0.45,
        "one-way": 0.55,
        reflective: 0.60,
        transparent: 0.50
      };

      // 🧾 COST PERCENTAGE (your production cost)
      const COST_PERCENT = 0.4; // 40% of selling price

      // 🟢 LARGE FORMAT RATES (per sq.ft)
      const largeRates = {
        banner: 2.8,
        sticker: 2.6,
        "one-way": 5.5,
        reflective: 5.5,
        transparent: 4.5
      };

      // 🔵 DIGITAL PRINT RATES
      const digitalRates = {
        A4: { color: 2.5, bw: 1 },
        A3: { color: 5, bw: 2 }
      };

      let cachedData = {};
      let salesChartInstance = null;
      let profitChartInstance = null;
      let topServicesChartInstance = null;
      let topProductsChartInstance = null;

      // ===== VARIABLES =====
      window.cart = window.cart || [];
      let products = [];

      let salesChart;
      let topChart;

      async function getOrdersData() {
        
        if (cachedData.jobs) return cachedData.jobs;

        const res = await fetch('/api/jobs');
        const data = await res.json();

        cachedData.jobs = data;
        return data;
      }

      // ===== LOGIN =====
      window.login = async function () {

        let username = document.getElementById('username').value.trim();
        let password = document.getElementById('password').value.trim();

        if (!username || !password) {
          alert("Enter username and password");
          return;
        }

        try {
          let res = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });

          if (!res.ok) {
            throw new Error("Server error");
          }

          let data = await res.json();

          console.log("🔐 LOGIN RESPONSE:", data);

          if (data.success) {

            // ✅ SAVE USER
            localStorage.setItem('user', JSON.stringify(data));

            // ✅ SHOW APP
            document.getElementById('loginScreen').style.display = "none";
            document.querySelector('.sidebar').style.display = "block";
            document.querySelector('.main').style.display = "block";

            // ✅ LOAD SYSTEM
            if (typeof applyRole === "function") applyRole();
            if (typeof loadProducts === "function") loadProducts();
            if (typeof loadDashboardSummary === "function") loadDashboardSummary();

          } else {
            alert("Invalid login");
          }

        } catch (err) {
          console.error("❌ LOGIN ERROR:", err);
          alert("Server not connected");
        }
      };

      // ===== LOGOUT =====
      function logout() {
        document.getElementById('loginScreen').style.display = "flex";
        document.querySelector('.sidebar').style.display = "none";
        document.querySelector('.main').style.display = "none";
      }


      // ===== RENDER =====
      function renderCart() {

        const container = document.getElementById('orders');
        if (!container) return;

        let total = 0;

        let html = `
          <div class="receipt-header">
            <h3>UNIIK GRAFIX PRESS</h3>
            <small>Weija - Accra</small>
            <hr>
          </div>
        `;

        if (!cart.length) {
          html += `<p style="text-align:center;">Cart is empty</p>`;
        } else {

          cart.forEach(item => {
            const price = Number(item.price) || 0;
            total += price;

            html += `
              <div class="cart-row">
                <span>${item.service}</span>
                <span>GHS ${price.toFixed(2)}</span>
              </div>
            `;
          });

          html += `
            <hr>
            <div class="cart-total">
              <strong>Total:</strong>
              <strong>GHS ${total.toFixed(2)}</strong>
            </div>
          `;
        }

        container.innerHTML = html;
      }

      async function loadProducts() {
        try {
          let res = await fetch('/api/products');
          let data = await res.json();

          console.log("PRODUCTS:", data);

          products = data;
          renderProducts();

        } catch (err) {
          console.log("ERROR LOADING PRODUCTS:", err);
          alert("Failed to load products");
        }
      }

      function renderProducts(list = products) {

        let html = "";

        list.forEach(p => {

          let stockClass = "";
          let disabled = "";

          if (p.qty <= 0) {
            stockClass = "out-stock";
            disabled = "disabled";
          } else if (p.qty <= 5) {
            stockClass = "low-stock";
          }

          html += `
            <div class="product-card">

              <button class="product-btn ${stockClass}" ${disabled}
                data-id="${p.id}"
                data-name="${p.name}"
                data-price="${p.price}">

                ${p.name}<br>
                GHS ${p.price}<br>
                <small>
                  ${p.qty <= 0 ? "Out of stock" : "Stock: " + p.qty}
                </small>
              </button>

              <button class="edit-btn" onclick="editProduct(${p.id})">Edit</button>
              <button class="delete-btn" onclick="deleteProduct(${p.id})">Delete</button>

            </div>
          `;
        });

        document.getElementById('productGrid').innerHTML = html;

        // 🔥 RE-ATTACH EVENTS EVERY TIME
        document.querySelectorAll('.product-btn').forEach(btn => {

          btn.addEventListener('click', function(){

            let id = this.dataset.id;
            let name = this.dataset.name;
            let price = this.dataset.price;

            quickAdd(name, price, id);

          });

        });
      }

      function quickAdd(name, price, id) {

        console.log("CLICKED:", name, price, id);

        const product = products.find(p => p.id == id);

        if (!product) {
          alert("Product not found");
          return;
        }

        if (product.qty <= 0) {
          alert("Out of stock!");
          return;
        }

        const cleanPrice = Number(price);

        if (isNaN(cleanPrice)) {
          alert("Invalid price");
          return;
        }

        // ✅ reduce stock
        product.qty--;

        // ✅ push clean object
        cart.push({
          productId: id,
          service: name,
          price: cleanPrice
        });

        renderCart();
        renderProducts();

        // ✅ update backend
        fetch('/api/products/stock/' + id, {
          method: 'PUT'
        });
      }

      // ===== CHECKOUT FUNCTION =====
      console.log("🔥 CHECKOUT CLICKED");
      async function checkout() {

        console.log("🔥 CHECKOUT STARTED");

        // =========================
        // ✅ VALIDATE CART
        // =========================
        if (!cart || cart.length === 0) {
          alert("Cart is empty");
          return;
        }

        // =========================
        // ✅ VALIDATE USER
        // =========================
        const user = JSON.parse(localStorage.getItem('user'));

        if (!user || !user.username) {
          alert("User not logged in");
          return;
        }

        // =========================
        // ✅ VALIDATE CART ITEMS
        // =========================
        for (const item of cart) {
          if (!item.service) {
            alert("Invalid item (missing service)");
            return;
          }

          if (!item.price || isNaN(item.price)) {
            alert(`Invalid price for ${item.service}`);
            return;
          }
        }

        // =========================
        // ✅ CUSTOMER
        // =========================
        const customerName =
          document.getElementById('customer')?.value.trim() || "Walk-in";

        try {

          // =========================
          // ✅ PREPARE DATA
          // =========================
          const payload = cart.map(item => ({
            product: item.service,
            price: Number(item.price),
            staff: user.username.toLowerCase(),
            customer: customerName
          }));

          console.log("📦 Sending payload:", payload);

          // =========================
          // ✅ SEND TO SERVER
          // =========================
          const res = await fetch('/api/orders/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orders: payload })
          });

          if (!res.ok) {
            throw new Error("Server error");
          }

          const data = await res.json();

          if (!data.success) {
            throw new Error("Failed to save orders");
          }

          // =========================
          // ✅ SUCCESS
          // =========================
          alert("Order saved ✅");

          // 🔥 IMPORTANT: clone BEFORE clearing (for receipt if needed)
          const savedCart = [...cart];

          cart = [];
          renderCart();

          // =========================
          // 🔄 REFRESH DATA
          // =========================
          if (typeof loadDashboardSummary === "function") {
            loadDashboardSummary();
          }

          // =========================
          // 🧹 CLEAR INPUT
          // =========================
          const customerInput = document.getElementById('customer');
          if (customerInput) customerInput.value = "";

          // =========================
          // 🧾 OPTIONAL AUTO PRINT
          // =========================
          // printReceipt(savedCart);

        } catch (err) {
          console.error("❌ Checkout error:", err);
          alert("Error saving order");
        }
      }

      // ===== RECEIPT FUNCTION =====
      console.log("🔥 CHECKOUT CLICKED", cart);
      function printReceipt() {

        if (!cart || cart.length === 0) {
          alert("Cart is empty");
          return;
        }

        const printData = [...cart]; // 🔥 clone BEFORE reset

        let total = 0;

        const itemsHTML = printData.map(item => {
          const price = Number(item.price) || 0;
          total += price;

          return `
            <div class="item">
              <span>${item.service}</span>
              <span>GHS ${price.toFixed(2)}</span>
            </div>
          `;
        }).join("");

        const printWindow = window.open('', '_blank', 'width=350,height=600');

        if (!printWindow) {
          alert("Popup blocked!");
          return;
        }

        printWindow.document.write(`
          <html>
          <body style="font-family:monospace; padding:10px;">

            <div style="text-align:center;">
              <img src="${LOGO}" style="height:50px;">
              <h3>UNIIK GRAFIX PRESS</h3>
              <small>${new Date().toLocaleString()}</small>
            </div>

            <hr>

            ${itemsHTML}

            <hr>

            <strong>Total: GHS ${total.toFixed(2)}</strong>

            <hr>

            <p style="text-align:center;">Thank you 🙏</p>

          </body>
          </html>
        `);

        printWindow.document.close();

        printWindow.onload = () => {
          printWindow.print();
          setTimeout(() => printWindow.close(), 500);
        };

        // RESET AFTER PRINT DATA PREPARED
        cart = [];
        renderCart();
      }

      async function loadChart() {

        const res = await fetch('/api/jobs');
        const data = await res.json();

        let map = {};

        // ✅ GROUP BY SERVICE (cleaner than raw list)
        data.forEach(item => {
          let name = item.product || "Unknown";
          let price = Number(item.price || 0);

          map[name] = (map[name] || 0) + price;
        });

        let labels = Object.keys(map);
        let values = Object.values(map);

        const canvas = document.getElementById('salesChart');
        if (!canvas) return;

        let ctx = canvas.getContext('2d');

        // ✅ GRADIENT
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, 'rgba(59,130,246,0.8)');
        gradient.addColorStop(1, 'rgba(59,130,246,0.2)');

        if (window.salesChartInstance) {
          window.salesChartInstance.destroy();
        }

        window.salesChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Sales',
              data: values,
              backgroundColor: gradient,
              hoverBackgroundColor: 'rgba(59,130,246,1)',
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false
          }
        });
      }

      async function loadTopServices() {

        const res = await fetch('/api/jobs');
        const data = await res.json();

        let count = {};

        data.forEach(item => {
          const key = item.service || "Unknown";
          count[key] = (count[key] || 0) + 1;
        });

        const labels = Object.keys(count);
        const values = Object.values(count);

        const canvas = document.getElementById('serviceAnalyticsChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        if (topServicesChartInstance) {
          topServicesChartInstance.destroy();
        }

        topServicesChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Services',
              data: values
            }]
          }
        });
      }

      let revenueChartInstance;

      async function loadRevenueChart() {

        try {
          const res = await fetch('/api/analytics/revenue-cost');
          const data = await res.json();

          const canvas = document.getElementById('profitAnalyticsChart');
          if (!canvas) return;

          const ctx = canvas.getContext('2d');

          if (revenueChartInstance) {
            revenueChartInstance.destroy();
          }

          revenueChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
              labels: ['Revenue', 'Cost'],
              datasets: [{
                label: 'GHS',
                data: [
                  Number(data.revenue || 0),
                  Number(data.cost || 0)
                ]
              }]
            }
          });

        } catch (err) {
          console.error("❌ Revenue chart error:", err);
        }
      }

      function searchProducts() {
        let search = document.getElementById('searchBox').value.toLowerCase();

        let filtered = products.filter(p =>
          p.name.toLowerCase().includes(search)
        );

        renderProducts(filtered);
      }

      function applyRole() {
        let user = JSON.parse(localStorage.getItem('user'));

        if (!user) return;

        // STAFF restrictions
        if (user.role === 'staff') {
          document.getElementById('productsTabBtn').style.display = 'none';
        }
      }

      async function editProduct(id) {
        const res = await fetch('/api/products');
        const list = await res.json();

        const product = list.find(p => p.id == id);

        // fill modal inputs
        document.getElementById('editName').value = product.name;
        document.getElementById('editPrice').value = product.price;
        document.getElementById('editCost').value = product.cost || 0;

        // store ID
        window.editingId = id;

        // show modal
        document.getElementById('editModal').style.display = "flex";
      }

      async function addProduct() {
        let name = document.getElementById('pname').value.trim();
        let price = Number(document.getElementById('pprice').value);
        let cost = Number(document.getElementById('pcost').value);

        if (!name || !price) {
          alert("Enter product");
          return;
        }

        if (window.editingId) {
          // ===== UPDATE =====
          await fetch('/api/products/' + window.editingId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, price, cost })
          });

          alert("Product updated ✅");

          window.editingId = null;

        } else {
          // ===== ADD NEW =====
          await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, price, cost })
          });

          alert("Product added ✅");
        }

        // ===== RESET FORM =====
        resetProductForm();

        loadProducts();
      }

      function closeModal() {
        document.getElementById('editModal').style.display = "none";
      }

      async function deleteProduct(id) {

        // ✅ confirm before deleting
        let ok = confirm("Are you sure you want to delete this product?");

        if (!ok) return;

        // ✅ send delete request
        await fetch('/api/products/' + id, {
          method: 'DELETE'
        });

        // ✅ reload products
        loadProducts();
      }

      async function deleteCustomer(id) {
        if (!confirm("Delete this customer?")) return;

        const res = await fetch(`/api/customers/${id}`, {
          method: 'DELETE'
        });

        const data = await res.json();

        if (data.success) {
          alert("Deleted ✅");
          loadCustomers();
        } else {
          alert("Failed ❌");
        }
      }

      async function loadCustomersDropdown() {
        try {
          const res = await fetch('/api/customers');
          const customers = await res.json();

          const select = document.getElementById('jobCustomer');

          if (!select) {
            console.warn("⚠️ jobCustomer not found");
            return;
          }

          // Reset
          select.innerHTML = '<option value="">Walk-in</option>';

          customers.forEach(c => {
            const option = document.createElement('option');
            option.value = c.id;
            option.textContent = `${c.name} - ${c.phone || ''}`;
            select.appendChild(option);
          });

        } catch (err) {
          console.error("❌ loadCustomersDropdown error:", err);
        }
      }

      function toggleSidebar() {
        document.querySelector('.sidebar').classList.toggle('collapsed');
        document.querySelector('.main').classList.toggle('collapsed');
      }

      let topChartInstance;

      async function loadTopProducts() {
        console.log("📊 Top Products chart running...");

        const canvas = document.getElementById('topProductsChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        try {
          let data = await getOrdersData();

          let map = {};

          data.forEach(order => {
            let name = order.product || "Unknown";
            map[name] = (map[name] || 0) + 1; // ✅ COUNT instead of price
          });

          let sorted = Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

          let labels = sorted.map(i => i[0]);
          let values = sorted.map(i => i[1]);

          // ✅ destroy old chart properly
          if (topProductsChartInstance) {
            topProductsChartInstance.destroy();
          }

          topProductsChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
              labels: labels,
              datasets: [{
                label: 'Top Products',
                data: values,
                borderWidth: 1
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false
            }
          });

        } catch (err) {
          console.error("❌ Top Products Error:", err);
        }
      }

      async function downloadPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        let res = await fetch('/api/top-products');
        let products = await res.json();

        let data = await getOrdersData();

        let total = 0;

        data.forEach(o => {
          let price = parseFloat(o.price);
          if (!isNaN(price)) {
            total += price;
          }
        });

        doc.setFontSize(16);
        doc.text("UNIIK GRAFIX PRESS", 10, 10);

        doc.setFontSize(10);
        doc.text("Date: " + new Date().toLocaleDateString(), 10, 20);

        doc.text("Top Products:", 10, 30);

        let y = 40;

        products.forEach((p, i) => {
          doc.text(`${i + 1}. ${p.product} (${p.total} sales)`, 10, y);
          y += 10;
        });

        doc.text("Total Sales: GHS " + total.toFixed(2), 10, y + 10);

        doc.save("report.pdf");
      }

function manualAdd(){

  let customer = document.getElementById('customer').value || "Walk-in";
  let service = document.getElementById('service').value;
  let price = Number(document.getElementById('price').value);

  // 👉 NEW FIELDS
  let width = Number(document.getElementById('width')?.value) || 0;
  let height = Number(document.getElementById('height')?.value) || 0;
  let quantity = Number(document.getElementById('quantity')?.value) || 1;
  let cost = Number(document.getElementById('cost')?.value) || 0;

  if(!service || !price){
    alert("Enter service and price");
    return;
  }

  cart.push({
    productId: null,
    customer,
    service,
    price,
    width,
    height,
    quantity,
    cost
  });

  renderCart();
}

      function loadProductSuggestions() {
      fetch('/api/products')
        .then(res => res.json())
        .then(data => {

          let html = "";

          data.forEach(p => {
            html += `<option value="${p.name}">`;
          });

          document.getElementById('productList').innerHTML = html;
        });
    }

      async function loadProfitChart() {

        let data = await getOrdersData();

        let grouped = {};

        data.forEach(item => {

          let date = item.date ? item.date.slice(0,10) : "Unknown";

          let price = Number(item.price) || 0;
          let cost = Number(item.cost) || 0;
          let profit = price - cost;

          if (!grouped[date]) {
            grouped[date] = { sales: 0, profit: 0 };
          }

          grouped[date].sales += price;
          grouped[date].profit += profit;

        });

        let labels = Object.keys(grouped);
        let salesData = labels.map(d => grouped[d].sales);
        let profitData = labels.map(d => grouped[d].profit);

        const canvas = document.getElementById('profitChart');
        if (!canvas) return;

        let ctx = canvas.getContext('2d');

        // ✅ GRADIENTS
        const salesGradient = ctx.createLinearGradient(0, 0, 0, 300);
        salesGradient.addColorStop(0, 'rgba(59,130,246,0.4)');
        salesGradient.addColorStop(1, 'rgba(59,130,246,0)');

        const profitGradient = ctx.createLinearGradient(0, 0, 0, 300);
        profitGradient.addColorStop(0, 'rgba(34,197,94,0.4)');
        profitGradient.addColorStop(1, 'rgba(34,197,94,0)');

        if (window.profitChartInstance) {
          window.profitChartInstance.destroy();
        }

        window.profitChartInstance = new Chart(ctx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [
              {
                label: 'Sales',
                data: salesData,
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                backgroundColor: salesGradient
              },
              {
                label: 'Profit',
                data: profitData,
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                backgroundColor: profitGradient
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false
          }
        });
      }

      function loadSalesByDateChart() {

        fetch('/api/orders')
          .then(res => res.json())
          .then(data => {

            let map = {};

            data.forEach(order => {
              let date = new Date(order.date).toLocaleDateString();
              let price = Number(order.price || 0);

              map[date] = (map[date] || 0) + price;
            });

            let labels = Object.keys(map);
            let values = Object.values(map);

            const canvas = document.getElementById('salesByDateChart');
            if (!canvas) return;

            let ctx = canvas.getContext('2d');

            // ✅ GRADIENT
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, 'rgba(34,197,94,0.4)');
            gradient.addColorStop(1, 'rgba(34,197,94,0)');

            if (window.salesByDateInstance) {
              window.salesByDateInstance.destroy();
            }

            window.salesByDateInstance = new Chart(ctx, {
              type: 'line',
              data: {
                labels: labels,
                datasets: [{
                  label: 'Sales by Date',
                  data: values,
                  borderWidth: 2,
                  tension: 0.4,
                  fill: true,
                  backgroundColor: gradient
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false
              }
            });

          });
      }

      function resetProductForm() {
        document.getElementById('pname').value = "";
        document.getElementById('pprice').value = "";
        document.getElementById('pcost').value = "";

        window.editingId = null;

        // reset title
        document.querySelector('#productsTab button').innerText = "Add Product";
      }

      async function updateProduct() {
        let name = document.getElementById('editName').value.trim();
        let price = Number(document.getElementById('editPrice').value);
        let cost = Number(document.getElementById('editCost').value);

        if (!name || !price) {
          alert("Enter product details");
          return;
        }

        await fetch('/api/products/' + window.editingId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, price, cost })
        });

        alert("Product updated ✅");

        closeModal();
        loadProducts();
      }

      window.onclick = function(event) {
        let modal = document.getElementById('editModal');

        if (event.target === modal) {
          closeModal();
        }
      }

      document.addEventListener('keydown', function(e) {
        if (e.key === "Escape") {
          closeModal();
        }
      });

      function togglePassword() {
        let input = document.getElementById('password');

        if (input.type === "password") {
          input.type = "text";
        } else {
          input.type = "password";
        }
      }

      function toggleSidebar() {
        document.querySelector('.sidebar').classList.toggle('collapsed');
        document.querySelector('.main').classList.toggle('collapsed');
      }

function showTab(tab, el) {

  console.log("📌 Tab clicked:", tab);

  // ===== ALL TABS =====
  const tabs = [
    'dashboard',
    'products',
    'reports',
    'charts',
    'users',
    'customers',
    'jobs',
    'analytics',
    'materials'
  ];

  // ===== HIDE ALL TABS =====
  tabs.forEach(t => {
    const tabEl = document.getElementById(`${t}Tab`);
    if (tabEl) tabEl.style.display = 'none';
  });

  // ===== SHOW ACTIVE TAB =====
  const activeTab = document.getElementById(`${tab}Tab`);
  if (activeTab) {
    activeTab.style.display = 'block';
  } else {
    console.warn(`⚠️ Tab not found: ${tab}`);
  }

  // ===== ACTIVE MENU =====
  document.querySelectorAll('.menu-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  if (el) el.classList.add('active');

  // ===== SAVE TAB =====
  localStorage.setItem('activeTab', tab);

  // ===== SAFE RUN =====
  const safeRun = (fn, name) => {
    try {
      if (typeof fn === "function") {
        fn();
      } else {
        console.warn(`⚠️ ${name} is not defined`);
      }
    } catch (err) {
      console.error(`❌ ${name} error:`, err);
    }
  };

  // ===== TAB LOGIC =====
  switch (tab) {

    case 'dashboard':
      console.log("📊 Loading dashboard...");
      safeRun(loadDashboardSummary, 'loadDashboardSummary');
      break;

    case 'reports':
      console.log("📊 Loading reports...");
      safeRun(loadReportSummary, 'loadReportSummary');
      safeRun(loadTopProductsList, 'loadTopProductsList');
      safeRun(loadTopCustomers, 'loadTopCustomers');
      safeRun(loadProductionReport, 'loadProductionReport');
      safeRun(loadOrdersTable, 'loadOrdersTable');
      break;

    case 'charts':
      console.log("📊 Loading charts...");
      setTimeout(() => {
        safeRun(loadChart, 'loadChart');
        safeRun(loadProfitChart, 'loadProfitChart');
        safeRun(loadTopProducts, 'loadTopProducts');
        safeRun(loadSalesByDateChart, 'loadSalesByDateChart');
        safeRun(loadStaffChart, 'loadStaffChart');
        safeRun(loadTopServicesChart, 'loadTopServicesChart');
      }, 300);
      break;

    case 'users':
      console.log("👥 Loading users...");
      safeRun(loadUsers, 'loadUsers');
      break;

    case 'customers':
      console.log("👤 Loading customers...");
      safeRun(loadCustomers, 'loadCustomers');
      break;

    case 'jobs':
      console.log("💼 Loading jobs...");
      safeRun(loadJobs, 'loadJobs');
      safeRun(loadCustomersDropdown, 'loadCustomersDropdown');
      safeRun(loadMaterialsDropdown, 'loadMaterialsDropdown');
      break;

    case 'products':
      console.log("📦 Loading products...");
      safeRun(loadProducts, 'loadProducts');
      break;

    case 'analytics':
      console.log("📊 Loading production analytics...");
      safeRun(loadProductionSummary, 'loadProductionSummary');
      safeRun(loadStaffAnalytics, 'loadStaffAnalytics');

      // 🔥 DELAY CHARTS (VERY IMPORTANT)
      setTimeout(() => {
        safeRun(loadTopServices, 'loadTopServices');
        safeRun(loadRevenueChart, 'loadRevenueChart');
      }, 200);

      break;

    case 'materials':
      console.log("📦 Loading materials...");
      safeRun(loadMaterials, 'loadMaterials');
      break;

    default:
      console.warn("⚠️ No handler for tab:", tab);
  }
}

      async function loadTopProductsList() {

        try {
          const res = await fetch('/api/top-products');
          const data = await res.json();

          console.log("TOP PRODUCTS:", data); // 🔍 DEBUG

          let html = "";

          data.forEach((p, i) => {
            html += `
              <li>
                <strong>${i + 1}.</strong> 
                ${p.product} - ${p.total} sales
              </li>
            `;
          });

          document.getElementById('topProducts').innerHTML = html;

        } catch (err) {
          console.error("❌ Top Products Error:", err);
        }
      }

      async function loadStaffChart() {

        const res = await fetch('/api/staff-sales-filtered?filter=all');
        const data = await res.json();

        console.log("👥 STAFF DATA:", data);

        const canvas = document.getElementById('staffChart');
        const ctx = canvas.getContext('2d');

        // ✅ DESTROY OLD CHART FIRST
        if (window.staffChartInstance) {
          window.staffChartInstance.destroy();
        }

        window.staffChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: data.map(d => d.staff),
            datasets: [{
              label: 'Sales by Staff',
              data: data.map(d => d.total)
            }]
          }
        });

        // ✅ UPDATE LEADERBOARD
        renderLeaderboard(data);
      }

      function renderLeaderboard(data) {

        let html = "";

        data.forEach((d, i) => {

          let medal = "";
          if (i === 0) medal = "🥇";
          else if (i === 1) medal = "🥈";
          else if (i === 2) medal = "🥉";

          html += `
            <li>
              ${medal} ${d.staff} — GHS ${Number(d.total).toFixed(2)}
            </li>
          `;
        });

        document.getElementById('leaderboard').innerHTML = html;
      }

      window.onload = function () {

        console.log("🚀 App initializing...");

        // ===== CHECK USER LOGIN =====
        let user = JSON.parse(localStorage.getItem('user'));

        if (user) {
          document.getElementById('loginScreen').style.display = "none";
          document.querySelector('.sidebar').style.display = "block";
          document.querySelector('.main').style.display = "block";

          applyRole();
          loadProducts();
          loadDashboardSummary();
        } else {
          return;
        }

        // ===== RESTORE TAB =====
        let savedTab = localStorage.getItem('activeTab') || 'dashboard';

        let btn = document.querySelector(
          `.menu-btn[onclick*="${savedTab}"]`
        );

        if (!btn) {
          savedTab = 'dashboard';
          btn = document.querySelector('.menu-btn');
        }

        // ✅ SAFE DELAY
        setTimeout(() => {
          showTab(savedTab, btn);
        }, 100);

      }; // ⚠️ VERY IMPORTANT (DO NOT REMOVE)

async function loadReportSummary() {

  const res = await fetch('/api/jobs');
  const data = await res.json();

  const filter = document.getElementById('dateFilter')?.value || 'all';
  const now = new Date();

  const filtered = data.filter(job => {
    const d = new Date(job.date);

    if (filter === 'today') return d.toDateString() === now.toDateString();

    if (filter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      return d >= weekAgo;
    }

    if (filter === 'month') {
      return d.getMonth() === now.getMonth() &&
             d.getFullYear() === now.getFullYear();
    }

    return true;
  });

  let totalSales = 0;
  let totalCost = 0;

  filtered.forEach(job => {
    const paid = Number(job.paid) || 0;
    const cost = Number(job.cost) || 0;

    totalSales += paid;
    totalCost += cost;
  });

  const profit = totalSales - totalCost;

  document.getElementById('reportTotalSales').innerText = "GHS " + totalSales.toFixed(2);
  document.getElementById('reportTotalOrders').innerText = filtered.length;
  document.getElementById('reportTotalProfit').innerText = "GHS " + profit.toFixed(2);
}

async function addCustomer() {

  const nameInput = document.getElementById('cname');
  const phoneInput = document.getElementById('cphone');

  if (!nameInput || !phoneInput) {
    console.error("❌ Input fields not found");
    return;
  }

  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();

  if (!name) {
    alert("Enter customer name");
    return;
  }

  try {

    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone })
    });

    const data = await res.json();

    console.log("👤 ADD CUSTOMER:", data);

    if (data.success) {

      alert("Customer added successfully");

      // ✅ CLEAR INPUTS
      nameInput.value = "";
      phoneInput.value = "";

      // ✅ REFRESH LIST
      loadCustomers();

    } else {
      alert(data.message || "Error adding customer");
    }

  } catch (err) {
    console.error("❌ ERROR:", err);
    alert("Server error");
  }
}

      function applyRole() {
        let user = JSON.parse(localStorage.getItem('user'));

        if (!user) return;

        console.log("USER ROLE:", user.role);

        // 👉 STAFF RESTRICTIONS
        if (user.role === 'staff') {

          document.querySelector('[onclick*="products"]').style.display = 'none';
          document.querySelector('[onclick*="reports"]').style.display = 'none';
          document.querySelector('[onclick*="charts"]').style.display = 'none';

          // 🔥 ADD THIS
          document.querySelector('[onclick*="users"]').style.display = 'none';
        }
      }

      async function createUser() {

        let username = document.getElementById('newUsername').value;
        let password = document.getElementById('newPassword').value;
        let role = document.getElementById('newRole').value;

        if (!username || !password) {
          alert("Enter username and password");
          return;
        }

        await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, role })
        });

        alert("User created ✅");

        loadUsers();
      }

      async function loadUsers() {

        try {
          let res = await fetch('/api/users');
          let data = await res.json();

          console.log("USERS:", data); // debug

          let html = "";

          data.forEach(user => {
            html += `
              <li style="
                display:flex;
                justify-content:space-between;
                background:#fff;
                padding:10px;
                margin-bottom:8px;
                border-radius:8px;
              ">
                <span>${user.username} (${user.role})</span>
                <button onclick="deleteUser('${user.username}')">Delete</button>
              </li>
            `;
          });

          document.getElementById('userList').innerHTML = html;

        } catch (err) {
          console.error("❌ Load users error:", err);
        }
      }

      async function deleteUser(username) {

        let ok = confirm("Delete user?");
        if (!ok) return;

        await fetch('/api/users/' + username, {
          method: 'DELETE'
        });

        loadUsers();
      }

      async function createUser() {

        let username = document.getElementById('newUsername').value.trim();
        let password = document.getElementById('newPassword').value.trim();
        let role = document.getElementById('newRole').value;

        if (!username || !password) {
          alert("Enter username and password");
          return;
        }

        await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, role })
        });

        alert("User created ✅");

        // clear inputs
        document.getElementById('newUsername').value = "";
        document.getElementById('newPassword').value = "";

        loadUsers();
      }

      async function loadUsers() {

        let res = await fetch('/api/users');
        let data = await res.json();

        let html = "";

        data.forEach(user => {
          html += `
            <li>
              ${user.username} (${user.role})
              <button onclick="deleteUser('${user.username}')">Delete</button>
            </li>
          `;
        });

        document.getElementById('userList').innerHTML = html;
      }

      async function deleteUser(username) {

        let ok = confirm("Delete user?");
        if (!ok) return;

        await fetch('/api/users/' + username, {
          method: 'DELETE'
        });

        loadUsers();
      }

      async function loadOrdersTable() {

        let res = await fetch('/api/orders');
        let data = await res.json();

        let html = "";

        data.forEach(order => {
          html += `
            <tr>
              <td>${order.service || order.product}</td>
              <td>GHS ${order.price}</td>
              <td>${order.staff || "N/A"}</td>
              <td>${order.date}</td>
            </tr>
          `;
        });

        document.getElementById('ordersTable').innerHTML = html;
      }

      async function loadStaffChart() {

        try {
          const filter = document.getElementById('staffFilter')?.value || "all";

          const res = await fetch(`/api/staff-sales-filtered?filter=${filter}`);
          const data = await res.json();

          console.log("👥 STAFF DATA:", data);

          if (!data || data.length === 0) {
            console.warn("No staff data");
            return;
          }

          const canvas = document.getElementById('staffChart');
          if (!canvas) {
            console.error("Canvas not found");
            return;
          }

          const ctx = canvas.getContext('2d');

          // ✅ DESTROY OLD CHART
          if (window.staffChartInstance) {
            window.staffChartInstance.destroy();
          }

          // ✅ CREATE NEW CHART
          window.staffChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
              labels: data.map(d => d.staff),
              datasets: [{
                label: 'Sales by Staff (GHS)',
                data: data.map(d => Number(d.total))
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false
            }
          });

          // ✅ UPDATE LEADERBOARD
          renderLeaderboard(data);

        } catch (err) {
          console.error("❌ Staff chart error:", err);
        }
      }

async function createJob() {
  try {

    // =========================
    // 👉 STEP 1: GET INPUTS
    // =========================
    const getVal = id => document.getElementById(id)?.value;

    const customer_id = getVal('jobCustomer') || null;
    const service = getVal('jobService')?.trim();
    const price = Number(getVal('jobPrice')) || 0;
    const date = getVal('jobDate') || new Date().toISOString();

    const category = getVal('jobCategory') || 'large';   // ✅ FIXED

    const width = Number(getVal('width')) || 0;
    const height = Number(getVal('height')) || 0;
    const quantity = Number(getVal('quantity')) || 1;

    const sizeText = getVal('jobSize')?.trim();

    let cost = Number(getVal('cost')) || 0;

    const roll_id = getVal('jobRoll') || null;  // ✅ FOR ROLL SELECTION

    const user = JSON.parse(localStorage.getItem('user'));

    // =========================
    // 👉 STEP 2: VALIDATION
    // =========================
    if (!service || price <= 0) {
      alert("Enter valid job details");
      return;
    }

    // =========================
    // 👉 STEP 3: AREA + COST
    // =========================
    let area = 0;

    // 🔥 1. Smart size input
    if (sizeText && typeof parseSize === "function") {
      area = parseSize(sizeText);
    }

    // 🔁 2. Fallback to width/height
    if (!area && width && height) {
      area = (width * height * quantity) / 144;
    }

    // 💰 3. Auto cost (if empty)
    if (!cost && area > 0) {

      const serviceText = service.toLowerCase();

      let type = "banner";
      if (serviceText.includes("sticker")) type = "sticker";
      if (serviceText.includes("one-way")) type = "one-way";
      if (serviceText.includes("reflective")) type = "reflective";

      const rate = printRates?.[type] || 15;

      cost = area * rate;
    }

    // =========================
    // 👉 STEP 4: SAVE JOB
    // =========================
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id,
        service,
        price,
        staff: user?.username || "admin",
        category,
        width,
        height,
        quantity,
        cost,
        date,
        roll_id   // ✅ SEND SELECTED ROLL
      })
    });

    const data = await res.json();

    if (!data.success) {
      alert("Failed to save job");
      return;
    }

    console.log("✅ JOB SAVED:", data);

    // =========================
    // 👉 STEP 5: RESET FORM
    // =========================
    [
      'jobService',
      'jobPrice',
      'width',
      'height',
      'quantity',
      'cost',
      'jobSize'
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    // reset dropdowns (optional)
    if (document.getElementById('jobRoll')) {
      document.getElementById('jobRoll').innerHTML = '';
    }

    // =========================
    // 👉 STEP 6: REFRESH UI
    // =========================
    await loadJobs();
    loadDashboardSummary();
    loadMaterials(); // 🔥 update stock immediately

  } catch (err) {
    console.error("❌ createJob error:", err);
    alert("Error creating job");
  }
}

function getMaterialName(service = "") {
  const text = service.toLowerCase();

  if (text.includes("banner")) return "Flexy";
  if (text.includes("sticker")) return "SAV";
  if (text.includes("one-way")) return "One-way";
  if (text.includes("reflective")) return "Reflective";

  return null;
}

async function loadJobs() {
  try {

    const res = await fetch('/api/jobs');
    const jobs = await res.json();

    console.log("💼 JOBS:", jobs);

    const list = document.getElementById('jobList');
    if (!list) return console.error("❌ jobList not found");

    list.innerHTML = "";

    // 👉 Cache jobs
    window.jobsCache = jobs;
    renderJobs(jobs);

    jobs.forEach(job => {

      // =========================
      // 👉 NORMALIZE DATA
      // =========================
      const paid = Number(job.paid) || 0;
      const price = Number(job.price) || 0;
      const cost = Number(job.cost) || 0;
      const qty = Number(job.quantity) || 1;

      const balance = Math.max(price - paid, 0);
      const profit = price - cost;

      // =========================
      // 👉 STATUS
      // =========================
      const status =
        balance === 0 ? "completed" :
        paid > 0 ? "in progress" :
        "pending";

      const statusColor = {
        pending: "orange",
        "in progress": "blue",
        completed: "green"
      }[status];

      const balanceColor = balance > 0 ? "red" : "green";

      // =========================
      // 👉 DISPLAY DATA
      // =========================
      const customer = job.customer_name || "Walk-in";

      const size = (job.width && job.height)
        ? `${job.width} × ${job.height} inches`
        : "N/A";

      const isPrinted = Number(job.printed) === 1;

      const printStatus = isPrinted
        ? `<span style="color:green;">🖨 Printed by ${job.printed_by || 'staff'}</span>`
        : `<span style="color:orange;">⏳ Not Printed</span>`;

      // =========================
      // 👉 BUTTONS
      // =========================
      const buttons = `

        ${balance > 0 ? `
          <button class="btn-pending" onclick="updateJobStatus(${job.id}, 'pending')">
            🕒 Pending
          </button>

          <button class="btn-progress" onclick="updateJobStatus(${job.id}, 'in progress')">
            ⚙️ In Progress
          </button>

          <button class="btn-pay" onclick="addPayment(${job.id})">
            💰 Pay (${formatMoney(balance)})
          </button>
        ` : `
          <span style="color:green; font-weight:bold;">
            ✔ Fully Paid
          </span>
        `}

        ${!isPrinted ? `
          <button class="btn-print" onclick="markPrintedById(${job.id})">
            🖨 Print
          </button>
        ` : ""}

        <button class="btn-receipt" onclick="sendReceiptWhatsAppById(${job.id})">
          📩 Receipt
        </button>

        <button class="btn-pdf" onclick="downloadReceiptPDFById(${job.id})">
          📄 PDF
        </button>

        <button onclick="sendReceiptImageWhatsAppById(${job.id})">
          🖼 WhatsApp Image
        </button>

      `;

      // =========================
      // 👉 CARD
      // =========================
      const li = document.createElement("div");
      li.className = "job-card";

      // ✅ STEP 4 GOES HERE
      li.style.borderLeft = isPrinted
        ? "5px solid #10b981"   // green = printed
        : "5px solid #f59e0b";  // orange = not printed

      li.style.borderLeft = isPrinted
        ? "5px solid green"
        : "5px solid orange";

      if (isPrinted) {
        li.style.background = "#f0fff4";
      }

      li.innerHTML = `
        <strong>${job.service}</strong> - ${formatMoney(price)}<br>

        Customer: ${customer}<br>
        ${printStatus}<br>

        📐 Size: ${size}<br>
        📦 Qty: ${qty}<br>

        Paid: ${formatMoney(paid)} |
        Balance: <span style="color:${balanceColor}; font-weight:bold;">
          ${formatMoney(balance)}
        </span><br>

        Status: <strong style="color:${statusColor}">
          ${status.toUpperCase()}
        </strong><br>

        Cost: ${formatMoney(cost)}<br>
        Profit: <span style="color:green; font-weight:bold;">
          ${formatMoney(profit)}
        </span><br>

        ${buttons}
      `;

      list.appendChild(li);
    });

  } catch (err) {
    console.error("❌ loadJobs error:", err);
    alert("Failed to load jobs");
  }
}

function filterJobs() {

  const search = document
    .getElementById('jobSearch')
    ?.value
    .toLowerCase() || "";

  if (!window.jobsCache) return;

  const filtered = window.jobsCache.filter(job => {

    const service = (job.service || "").toLowerCase();
    const customer = (job.customer_name || "").toLowerCase();

    return service.includes(search) || customer.includes(search);
  });

  renderJobs(filtered); // 🔥 IMPORTANT
}

function renderJobs(jobs) {

  const list = document.getElementById('jobList');
  if (!list) return;

  list.innerHTML = "";

  if (!jobs.length) {
    list.innerHTML = "<p>No jobs found</p>";
    return;
  }

  jobs.forEach(job => {

    const li = document.createElement("li");
    li.className = "job-card";

    const paid = Number(job.paid) || 0;
    const price = Number(job.price) || 0;
    const balance = price - paid;

    li.innerHTML = `
      <strong>${job.service}</strong><br>
      Customer: ${job.customer_name || 'Walk-in'}<br>

      Price: GHS ${price.toFixed(2)}<br>
      Paid: GHS ${paid.toFixed(2)}<br>

      <span style="color:${balance > 0 ? 'red' : 'green'};">
        Balance: GHS ${balance.toFixed(2)}
      </span>
    `;

    list.appendChild(li);
  });
}

function markPrintedById(id) {

  const job = window.jobsCache.find(j => Number(j.id) === Number(id));

  if (!job) {
    alert("Job not found");
    return;
  }

  markPrinted(job);
}

async function markPrinted(job) {

  await fetch(`/api/jobs/${job.id}/print`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      printed_by: "staff"
    })
  });

  // 🔥 Notify customer
  notifyCustomerReady(job);

  loadJobs();
}

async function addPayment(jobId) {
  try {

    // 👉 1. GET JOB FROM UI CACHE (FASTER)
    const job = window.jobsCache?.find(j => j.id === jobId);

    if (!job) {
      alert("Job not found");
      return;
    }

    const paid = Number(job.paid) || 0;
    const price = Number(job.price) || 0;

    let balance = Math.max(price - paid, 0);

    // 🚫 Already paid
    if (balance === 0) {
      alert("This job is already fully paid");
      return;
    }

    // 👉 2. INPUT
    const amountInput = prompt(`Enter amount (Balance: GHS ${balance})`);
    if (!amountInput) return;

    const amount = Number(amountInput);

    // 👉 3. VALIDATION
    if (isNaN(amount) || amount <= 0) {
      alert("Enter a valid amount");
      return;
    }

    if (amount > balance) {
      alert(`Amount exceeds balance (GHS ${balance})`);
      return;
    }

    // 👉 4. OPTIONAL DATE
    const date = prompt("Enter payment date (YYYY-MM-DD) or leave empty:");

    // 👉 5. SAVE
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        amount,
        method: "cash",
        date: date || null
      })
    });

    const data = await res.json();

    if (!data.success) {
      alert("Payment failed");
      return;
    }

    // 👉 6. REFRESH
    await loadJobs();
    loadDashboardSummary();

    // 👉 7. PRINT
    if (confirm("Print receipt?")) {
      printReceipt(jobId);
    }

  } catch (err) {
    console.error("❌ Payment error:", err);
    alert("Error processing payment");
  }
}


async function loadCustomerDropdown() {

  try {
    let res = await fetch('/api/customers');
    let data = await res.json();

    console.log("👤 DROPDOWN CUSTOMERS:", data);

    let select = document.getElementById('jobCustomer');

    if (!select) {
      console.error("❌ jobCustomer select not found");
      return;
    }

    select.innerHTML = "";

    data.forEach(c => {
      let option = document.createElement('option');
      option.value = c.id;
      option.textContent = c.name;
      select.appendChild(option);
    });

  } catch (err) {
    console.error("❌ Dropdown error:", err);
  }
}

function generateReceipt(job) {

  let receipt = `
  ===== RECEIPT =====
  Service: ${job.service}
  Price: GHS ${job.price}
  Customer: ${job.customer_name}

  Thank you!
  `;

  alert(receipt);
}

async function loadDashboardSummary() {
  try {
    const res = await fetch('/api/dashboard-summary');

    if (!res.ok) {
      throw new Error("Failed to fetch dashboard");
    }

    const data = await res.json();

    console.log("📊 Dashboard data:", data);

    // ===== SAFE VALUES =====
    const income = Number(data.income) || 0;
    const totalSales = Number(data.totalSales) || 0;
    const totalProfit = Number(data.totalProfit) || 0;
    const totalOrders = Number(data.totalOrders) || 0;
    const unpaidJobs = Number(data.unpaidJobs) || 0;
    const outstanding = Number(data.outstanding) || 0;
    const todaySales = Number(data.todaySales) || 0;

    // ===== UPDATE UI =====
    setText('totalIncomeToday', formatMoney(income));
    setText('unpaidJobs', unpaidJobs);
    setText('outstandingBalance', formatMoney(outstanding));

    setText('totalSales', formatMoney(totalSales));
    setText('totalOrders', totalOrders);
    setText('todaySales', formatMoney(todaySales));
    setText('totalProfit', formatMoney(totalProfit));

    // ✅ STEP 5 (CORRECT PLACE)
    loadTopServices();

  } catch (err) {
    console.error("❌ Dashboard error:", err);
  }
}

async function printReceipt(jobId) {

  // 🔥 GET JOB
  let res = await fetch('/api/jobs');
  let jobs = await res.json();
  let job = jobs.find(j => j.id == jobId);

  // 🔥 GET PAYMENTS LIST
  let payRes = await fetch(`/api/payments/${jobId}`);
  let payments = await payRes.json();

  let totalPaid = 0;
  let paymentHTML = "";

  if (payments.length === 0) {
    paymentHTML = "<p>No payments</p>";
  } else {
    payments.forEach(p => {
      totalPaid += Number(p.amount);

      paymentHTML += `
        <p>GHS ${p.amount} (${p.method})</p>
      `;
    });
  }

  let balance = job.price - totalPaid;
  let status = balance <= 0 ? "PAID" : "PENDING";
  let statusColor = balance <= 0 ? 'green' : 'red';

  // 🧾 RECEIPT HTML
  let receiptHTML = `
    <html>
    <head>
      <title>Receipt</title>
      <style>
        body { font-family: monospace; text-align: center; }
        .box { width: 260px; margin:auto; }
        hr { border:1px dashed #000; }
        p { margin: 4px 0; }
      </style>
    </head>

    <body>
      <div class="box">

        <img src="http://localhost:3000/logo.png" 
            style="width:80px; margin-bottom:5px;" />

        <h3>UNIIK GRAFIX</h3>
        <hr>

        <p>Service: ${job.service}</p>
        <p>Customer: ${job.customer_name || "Walk-in"}</p>
        <p>Date: ${new Date().toLocaleString()}</p>

        <hr>

        <p><strong>Payments:</strong></p>
        ${paymentHTML}

        <hr>

        <p>Total: GHS ${job.price}</p>
        <p>Paid: GHS ${totalPaid}</p>
        <p>Balance: GHS ${balance}</p>

        <hr>

        <strong>${status}</strong>

        <hr>
        <p>Thank you!</p>

      </div>
    </body>
    </html>
  `;

  // 🖨 PRINT
  let win = window.open('', '', 'width=300,height=600');
  win.document.write(receiptHTML);
  win.document.close();
  win.print();
}

async function viewPayments(jobId) {

  try {
    let res = await fetch(`/api/payments/${jobId}`);
    let data = await res.json();

    let content = document.getElementById('paymentContent');

    if (!data.length) {
      content.innerHTML = "<p>No payments yet</p>";
    } else {

      content.innerHTML = "";

      data.forEach(p => {
        content.innerHTML += `
          <div style="border-bottom:1px solid #ccc; padding:6px;">
            GHS ${p.amount} (${p.method})

            <button onclick="editPayment(${p.id}, ${jobId})">✏</button>
            <button onclick="deletePayment(${p.id}, ${jobId})">❌</button>
          </div>
        `;
      });

    }

    // 🔥 SHOW MODAL
    document.getElementById('paymentModal').style.display = 'block';

  } catch (err) {
    console.error(err);
    alert("Error loading payments");
  }
}

async function editPayment(paymentId, jobId) {

  let newAmount = prompt("Enter new amount:");
  if (!newAmount) return;

  try {

    await fetch(`/api/payments/${paymentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Number(newAmount),
        method: "cash"
      })
    });

    // 🔄 refresh
    viewPayments(jobId);
    loadJobs();

  } catch (err) {
    console.error(err);
    alert("Update failed");
  }
}

async function deletePayment(paymentId, jobId) {

  if (!confirm("Delete this payment?")) return;

  try {

    await fetch(`/api/payments/${paymentId}`, {
      method: 'DELETE'
    });

    // 🔄 refresh
    viewPayments(jobId);
    loadJobs();

  } catch (err) {
    console.error(err);
    alert("Delete failed");
  }
}

function closePaymentModal() {
  document.getElementById('paymentModal').style.display = 'none';
}

    async function updateJobStatus(id, status) {

      await fetch('/api/jobs/' + id + '/status', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ status })
      });

      loadJobs();
    }

async function loadTopCustomers() {

  const res = await fetch('/api/top-customers');
  const data = await res.json();

  const list = document.getElementById('topCustomersList');
  list.innerHTML = "";

  data.forEach((c, index) => {

    const div = document.createElement('div');
    div.className = "list-item";

    div.innerHTML = `
      ${index + 1}. ${c.name} — GHS ${Number(c.total).toFixed(2)}
    `;

    if (index === 0) {
      div.style.fontWeight = "bold";
      div.style.color = "green";
    }

    list.appendChild(div);
  });
}

let servicesChartInstance = null;

async function loadTopServicesChart() {

  let res = await fetch('/api/top-products');
  let data = await res.json();

  console.log("📊 SERVICES:", data);

  let labels = data.map(p => p.name);
  let values = data.map(p => p.count);

  let ctx = document.getElementById('servicesChart');

  // 🔥 destroy old chart (VERY IMPORTANT)
  if (servicesChartInstance) {
    servicesChartInstance.destroy();
  }

  servicesChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Sales',
        data: values
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      }
    }
  });

}

async function updateJobStatus(jobId, status) {

  try {

    await fetch(`/api/jobs/${jobId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });

    // 🔄 refresh jobs
    loadJobs();

  } catch (err) {
    console.error(err);
    alert("Failed to update status");
  }
}

let customersCache = []; // 🔥 GLOBAL STORAGE

async function loadCustomers() {
  try {
    const res = await fetch('/api/customers');

    if (!res.ok) {
      throw new Error("Failed to fetch customers");
    }

    const customers = await res.json();

    console.log("👥 Customers:", customers);

    // 🔥 SAVE FOR SEARCH/FILTER
    customersCache = customers;

    renderCustomers(customers);

  } catch (err) {
    console.error("❌ loadCustomers error:", err);
  }
}

function filterCustomers() {

  const search = document
    .getElementById('customerSearch')
    .value
    .toLowerCase();

  const filter = document.getElementById('customerFilter').value;

  let filtered = customersCache.filter(c => {
    const name = (c.name || "").toLowerCase();
    const phone = (c.phone || "").toLowerCase();

    return name.includes(search) || phone.includes(search);
  });

  // 📂 FILTER: RECENT (last 7 days)
  if (filter === 'recent') {
    const now = new Date();

    filtered = filtered.filter(c => {
      if (!c.created_at) return false;

      const created = new Date(c.created_at);
      const diff = (now - created) / (1000 * 60 * 60 * 24);

      return diff <= 7;
    });
  }

  renderCustomers(filtered);
}

function renderCustomers(list) {

  const listEl = document.getElementById('customerList');

  if (!listEl) {
    console.warn("⚠️ customerList not found");
    return;
  }

  listEl.innerHTML = "";

  if (!list.length) {
    listEl.innerHTML = "<p>No customers found</p>";
    return;
  }

  list.forEach(c => {

    const li = document.createElement("li");
    li.className = "customer-item";

    li.innerHTML = `
      <div>
        <strong>${c.name}</strong><br>
        <small>${c.phone || ''}</small>
      </div>

      <div>
        <button onclick="viewCustomerHistory(${c.id}, '${c.name}')">
          📜 History
        </button>

        <button onclick="deleteCustomer(${c.id})" class="btn-danger">
          Delete
        </button>
      </div>
    `;

    listEl.appendChild(li);
  });
}

async function markPrinted(jobId) {

  await fetch(`/api/jobs/${jobId}/print`, {
    method: 'PUT'
  });

  alert("Marked as printed");

  loadJobs();
}

function toggleJobFields() {

  const category = document.getElementById('jobCategory').value;

  const large = document.getElementById('largeFields');
  const digital = document.getElementById('digitalFields');

  if (category === 'large') {
    large.style.display = 'grid';
    digital.style.display = 'none';
  } else {
    large.style.display = 'none';
    digital.style.display = 'grid';
  }
}

window.onload = function() {
  toggleJobFields();
};

function calculatePrice() {

  const category = document.getElementById('jobCategory').value;
  const service = document.getElementById('jobService').value.toLowerCase();

  let price = 0;

  // 🟢 LARGE FORMAT
  if (category === 'large') {

    const width = Number(document.getElementById('width').value) || 0;
    const height = Number(document.getElementById('height').value) || 0;
    const qty = Number(document.getElementById('quantity').value) || 1;

    const area = (width * height * qty) / 144;

    let rate = 2.8; // default banner

    if (service.includes("sticker")) rate = largeRates.sticker;
    else if (service.includes("one-way")) rate = largeRates["one-way"];
    else if (service.includes("reflective")) rate = largeRates.reflective;
    else if (service.includes("transparent")) rate = largeRates.transparent;

    price = area * rate;
  }

  // 🔵 DIGITAL PRINT
  else {

    const size = document.getElementById('paperSize').value;
    const type = document.getElementById('printType').value;

    price = digitalRates[size][type];
  }

  // 👉 SET PRICE FIELD
  document.getElementById('jobPrice').value = price.toFixed(2);
  // 👉 AUTO COST
  let costPercent = 0.4; // default

  if (service.includes("sticker")) costPercent = materialCost.sticker;
  else if (service.includes("one-way")) costPercent = materialCost["one-way"];
  else if (service.includes("reflective")) costPercent = materialCost.reflective;
  else if (service.includes("transparent")) costPercent = materialCost.transparent;
  else costPercent = materialCost.banner;

  const cost = price * costPercent;

  document.getElementById('cost').value = cost.toFixed(2);

  // 👉 AUTO PROFIT
  const profit = price - cost;

  document.getElementById('profitPreview').innerText =
    `Profit: GHS ${profit.toFixed(2)}`;

}

async function loadProductionReport() {

  try {
    const res = await fetch('/api/production-report');
    const data = await res.json();

    console.log("📊 PRODUCTION:", data);

    const el = document.getElementById('prodRevenue');
    if (el) el.innerText = `GHS ${data.totalRevenue || 0}`;

  } catch (err) {
    console.error(err);
  }
}

async function markPrinted(id) {
  try {
    const user = JSON.parse(localStorage.getItem('user'));

    const res = await fetch(`/api/jobs/${id}/print`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        printed_by: user?.username || 'staff'
      })
    });

    const data = await res.json();

    if (data.success) {
      alert("Marked as printed ✅");
      loadJobs(); // refresh jobs
    } else {
      alert("Failed to update");
    }

  } catch (err) {
    console.error(err);
  }
}

async function loadProductionAnalytics() {

  const res = await fetch('/api/production-analytics');
  const data = await res.json();

  console.log("📊 ANALYTICS:", data);

  // ===== CARDS =====
  document.getElementById('totalPrinted').innerText = data.totalPrintedJobs;
  document.getElementById('totalArea').innerText = data.totalArea.toFixed(2) + " sq.ft";
  document.getElementById('totalRevenue').innerText = "GHS " + data.totalRevenue.toFixed(2);
  document.getElementById('totalProfit').innerText = "GHS " + data.totalProfit.toFixed(2);

  // ===== LOAD CHARTS =====
  loadAnalyticsCharts(data);
}

let staffAnalyticsChart;
let serviceAnalyticsChart;
let profitAnalyticsChart;

function loadAnalyticsCharts(data) {

  // ===== STAFF CHART =====
  const staffLabels = Object.keys(data.staffMap);
  const staffValues = Object.values(data.staffMap);

  const staffCtx = document.getElementById('staffAnalyticsChart').getContext('2d');

  if (staffAnalyticsChart) staffAnalyticsChart.destroy();

  staffAnalyticsChart = new Chart(staffCtx, {
    type: 'bar',
    data: {
      labels: staffLabels,
      datasets: [{
        label: 'Jobs Printed',
        data: staffValues
      }]
    }
  });


  // ===== SERVICE PIE =====
  const serviceLabels = Object.keys(data.serviceMap);
  const serviceValues = Object.values(data.serviceMap);

  const serviceCtx = document.getElementById('serviceAnalyticsChart').getContext('2d');

  if (serviceAnalyticsChart) serviceAnalyticsChart.destroy();

  serviceAnalyticsChart = new Chart(serviceCtx, {
    type: 'pie',
    data: {
      labels: serviceLabels,
      datasets: [{
        data: serviceValues
      }]
    }
  });


  // ===== PROFIT CHART =====
  const profitCtx = document.getElementById('profitAnalyticsChart').getContext('2d');

  if (profitAnalyticsChart) profitAnalyticsChart.destroy();

  profitAnalyticsChart = new Chart(profitCtx, {
    type: 'bar',
    data: {
      labels: ['Revenue', 'Cost', 'Profit'],
      datasets: [{
        data: [
          data.totalRevenue,
          data.totalCost,
          data.totalProfit
        ]
      }]
    }
  });

}

async function loadStaffAnalytics() {
  const res = await fetch('/api/analytics/staff-performance');
  const data = await res.json();

  const labels = data.map(d => d.staff || "Unknown");
  const values = data.map(d => d.total);

  const ctx = document.getElementById('staffAnalyticsChart').getContext('2d');

  if (window.staffChartInstance) {
    window.staffChartInstance.destroy();
  }

  window.staffChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Jobs Printed',
        data: values
      }]
    }
  });
}

async function viewCustomerHistory(customerId, name) {
  try {
    const res = await fetch(`/api/customers/${customerId}/jobs`);
    const jobs = await res.json();

    let html = `
      <h3 style="margin-bottom:10px;">${name} - Job History</h3>
    `;

    if (!jobs || jobs.length === 0) {
      html += `<p style="color:#888;">No jobs found</p>`;
    }

    jobs.forEach(job => {

      const paid = Number(job.paid) || 0;
      const price = Number(job.price) || 0;
      const balance = price - paid;

      const isPaid = balance <= 0;

      html += `
        <div style="
          border:1px solid #eee;
          padding:12px;
          margin:10px 0;
          border-radius:10px;
          background:${isPaid ? '#e8f8f5' : '#fff'};
        ">

          <strong>${job.service || 'Service'}</strong><br>

          <small>Date: ${job.date || '-'}</small><br>

          <small>Price: GHS ${price.toFixed(2)}</small><br>
          <small>Paid: GHS ${paid.toFixed(2)}</small><br>

          <strong style="color:${isPaid ? 'green' : 'red'};">
            Balance: GHS ${balance.toFixed(2)}
          </strong>

        </div>
      `;
    });

    document.getElementById('customerHistoryBox').innerHTML = html;

  } catch (err) {
    console.error("❌ History error:", err);
  }
}

async function addMaterial() {
  try {

    // =========================
    // 👉 GET INPUTS
    // =========================
    const getVal = id => document.getElementById(id)?.value.trim();

    const name = getVal('matName');
    const category = getVal('matCategory');
    const type = getVal('matType');
    const size = getVal('matSize');
    const unit = getVal('matUnit');
    const quantity = Number(document.getElementById('matQty').value) || 0;
    const area = calculateMaterialArea(size);

    // =========================
    // 👉 VALIDATION
    // =========================
    if (!name || quantity <= 0) {
      alert("Enter material name and valid quantity");
      return;
    }

    // =========================
    // 👉 SEND TO BACKEND
    // =========================
    const res = await fetch('/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category,
        type,
        size,
        unit,
        quantity
      })
    });

    if (!res.ok) throw new Error("Failed to add material");

    // =========================
    // 👉 REFRESH
    // =========================
    await loadMaterials();

    // =========================
    // 👉 CLEAR FORM
    // =========================
    ['matName','matCategory','matType','matSize','matUnit','matQty']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });

  } catch (err) {
    console.error("❌ addMaterial error:", err);
    alert("Error adding material");
  }
}

async function loadProductionSummary() {
  try {
    const res = await fetch('/api/analytics/production-summary');

    if (!res.ok) {
      throw new Error("Failed to fetch production summary");
    }

    const data = await res.json();

    console.log("📊 ANALYTICS DATA:", data);

    // ===== SAFE VALUES =====
    const totalPrinted = Number(data.totalPrinted) || 0;
    const totalArea = Number(data.totalArea) || 0;
    const totalRevenue = Number(data.totalRevenue) || 0;
    const totalProfit = Number(data.totalProfit) || 0;

    // ===== SAFE UI SETTER =====
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (!el) {
        console.warn(`⚠️ Missing element: ${id}`);
        return;
      }
      el.innerText = value;
    };

    // ===== UPDATE UI =====
    setText('totalPrinted', totalPrinted);
    setText('totalArea', totalArea.toFixed(2) + " sq.ft");
    setText('totalRevenue', formatMoney(totalRevenue));
    setText('totalProfit', formatMoney(totalProfit));

    setText("totalWaste", (data.totalWaste || 0).toFixed(2) + " sq.ft");
    setText("efficiency", (data.efficiency || 0).toFixed(1) + "%");

  } catch (err) {
    console.error("❌ loadProductionSummary error:", err);
  }
}

async function loadMaterials() {
  try {
    const res = await fetch('/api/materials');

    if (!res.ok) {
      throw new Error("Failed to fetch materials");
    }

    const materials = await res.json();

    const list = document.getElementById('materialList');

    if (!list) {
      console.warn("⚠️ materialList not found");
      return;
    }

    list.innerHTML = "";

    materials.forEach(m => {

      const area = Number(m.total_area) || 0;

      // 🔥 LOW STOCK (you can adjust this number)
      const isLow = area < 50;

      // 🔥 CREATE ITEM
      const li = document.createElement('li');

      li.style.margin = "10px 0";
      li.style.padding = "12px";
      li.style.borderRadius = "10px";
      li.style.background = "#fff";

      // ✅ LOW STOCK UI
      if (m.is_low) {
        li.style.background = "#ffe6e6";
      }

      // 🔥 COLOR BASED ON STOCK
      li.style.border = isLow 
        ? "2px solid red" 
        : "1px solid #eee";

      // 🔥 HTML CONTENT (CLEAN + CLEAR)
      li.className = "material-item";

      li.innerHTML = `
        <div class="material-row">

          <div class="material-info">
            <strong>${m.name}</strong>
            <span class="material-type">(${m.type || '-'})</span>

            <div class="material-meta">
              <div>Size: ${m.size || '-'}</div>

              <div>
                Stock:
                <strong>${area.toFixed(2)} sq.ft</strong>
                ${isLow ? '<span class="low-stock">⚠ Low</span>' : ''}
              </div>
            </div>
          </div>

          <div class="material-actions">
            <button onclick="deleteMaterial(${m.id})" class="btn-danger">
              Delete
            </button>
          </div>

        </div>
      `;

      list.appendChild(li);
    });

  } catch (err) {
    console.error("❌ loadMaterials error:", err);
  }
}

async function loadMaterialsDropdown() {
  try {
    const res = await fetch('/api/materials');
    const materials = await res.json();

    const select = document.getElementById('jobMaterial');
    const rollSelect = document.getElementById('jobRoll');

    if (!select) return;

    select.innerHTML = '<option value="">Select Material</option>';
    if (rollSelect) {
      rollSelect.innerHTML = '<option value="">Select Roll</option>';
    }

    materials.forEach(m => {
      const option = document.createElement('option');
      option.value = m.id;
      option.textContent = `${m.name} (${m.type || '-'}) ${m.size || ''} - ${Number(m.total_area || 0).toFixed(2)} sq.ft`;
      select.appendChild(option);
    });

    select.onchange = () => loadRollsDropdown(select.value);

  } catch (err) {
    console.error("❌ loadMaterialsDropdown error:", err);
  }
}

async function loadRollsDropdown(materialId) {
  try {
    const select = document.getElementById('jobRoll');

    if (!select) return;

    select.innerHTML = '<option value="">Select Roll</option>';

    if (!materialId) return;

    const res = await fetch(`/api/materials/${materialId}/rolls`);
    const rolls = await res.json();

    rolls
      .filter(roll => Number(roll.remaining_area || 0) > 0)
      .forEach(roll => {
        const option = document.createElement('option');
        option.value = roll.id;
        option.textContent = `${roll.roll_name || 'Roll #' + roll.id} - ${Number(roll.remaining_area || 0).toFixed(2)} sq.ft left`;
        select.appendChild(option);
      });

  } catch (err) {
    console.error("❌ loadRollsDropdown error:", err);
  }
}

async function deleteMaterial(id) {
  if (!confirm("Delete this material?")) return;

  await fetch(`/api/materials/${id}`, {
    method: 'DELETE'
  });

  loadMaterials();
}

function markPrinted(id) {

  const user = JSON.parse(localStorage.getItem('user'));

  fetch(`/api/jobs/${id}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user: user?.username || "staff"
    })
  })
  .then(() => loadJobs());
}

function parseSize(sizeText) {
  if (!sizeText) return null;

  sizeText = sizeText.toLowerCase().trim();

  // 👉 inches (e.g. 36 x 48)
  let inchMatch = sizeText.match(/(\d+)\s*(x|by)\s*(\d+)/);

  if (inchMatch) {
    let w = Number(inchMatch[1]);
    let h = Number(inchMatch[3]);

    // convert inches → feet
    return (w * h) / 144;
  }

  // 👉 feet (e.g. 10ft x 5ft)
  let ftMatch = sizeText.match(/(\d+)\s*ft\s*(x|by)?\s*(\d+)\s*ft/);

  if (ftMatch) {
    let w = Number(ftMatch[1]);
    let h = Number(ftMatch[3]);

    return w * h;
  }

  return null;
}

function sendReceiptWhatsApp(job) {

  if (!job || !job.customer_phone) {
    alert("No phone number");
    return;
  }

  // ✅ FIX PHONE FORMAT (Ghana)
  let phone = job.customer_phone.replace(/\D/g, ""); // remove spaces

  if (phone.startsWith("0")) {
    phone = "233" + phone.slice(1);
  }

  const paid = Number(job.paid) || 0;
  const price = Number(job.price) || 0;

  const message = `
🧾 *RECEIPT - UNIIK GRAFIX*

Customer: ${job.customer_name || ''}
Service: ${job.service}

Price: GHS ${price.toFixed(2)}
Paid: GHS ${paid.toFixed(2)}

Balance: GHS ${(price - paid).toFixed(2)}

Thank you 🙏
  `;

  // ✅ CORRECT LINK
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  console.log("📲 Opening WhatsApp:", url);

  window.open(url, "_blank");
}

function sendReceiptWhatsAppById(id) {

  const job = window.jobsCache.find(j => Number(j.id) === Number(id));

  if (!job) {
    alert("Job not found");
    return;
  }

  sendReceiptWhatsApp(job);
}

const LOGO = "data:image/png;base64,iVBORw0KGgoAAA...";

function generateReceiptHTML(job) {

  const paid = Number(job.paid) || 0;
  const price = Number(job.price) || 0;
  const balance = price - paid;

  return `
  <div style="
    font-family: Arial, sans-serif;
    padding: 20px;
    max-width: 480px;
    margin: auto;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #ffffff;
    color: #111827;
  ">

    <!-- HEADER -->
    <div style="display:flex; justify-content:space-between; align-items:center;">
      
      <div>
        <h2 style="margin:0; font-size:20px;">UNIIK GRAFIX</h2>
        <small style="color:#6b7280;">Printing Services</small>
      </div>

      <!-- ✅ BASE64 LOGO -->
      <img src="${LOGO}" style="height:50px;" />

    </div>

    <hr style="margin:10px 0; border:0; border-top:1px solid #e5e7eb;">

    <!-- INFO -->
    <div style="display:flex; justify-content:space-between; font-size:13px;">
      
      <div>
        <strong>Customer:</strong><br>
        ${job.customer_name || 'Walk-in'}
      </div>

      <div style="text-align:right;">
        <strong>Invoice #:</strong> ${job.id}<br>
        <strong>Date:</strong><br>
        ${new Date().toLocaleString()}
      </div>

    </div>

    <hr style="margin:10px 0; border:0; border-top:1px solid #e5e7eb;">

    <!-- TABLE -->
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="text-align:left; padding:8px;">Service</th>
          <th style="text-align:right; padding:8px;">Amount</th>
        </tr>
      </thead>

      <tbody>
        <tr>
          <td style="padding:8px;">${job.service}</td>
          <td style="text-align:right; padding:8px;">
            GHS ${price.toFixed(2)}
          </td>
        </tr>
      </tbody>
    </table>

    <hr style="margin:10px 0; border:0; border-top:1px solid #e5e7eb;">

    <!-- TOTALS -->
    <div style="font-size:14px;">
      
      <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
        <span>Paid:</span>
        <span>GHS ${paid.toFixed(2)}</span>
      </div>

      <div style="
        display:flex;
        justify-content:space-between;
        font-weight:bold;
        font-size:15px;
      ">
        <span>Balance:</span>
        <span style="color:${balance > 0 ? '#ef4444' : '#10b981'};">
          GHS ${balance.toFixed(2)}
        </span>
      </div>

    </div>

    <hr style="margin:12px 0; border:0; border-top:1px solid #e5e7eb;">

    <!-- FOOTER -->
    <div style="text-align:center; font-size:12px; color:#6b7280;">
      Thank you for your business 🙏<br>
      📞 0551366601
    </div>

  </div>
  `;
}

function downloadReceiptPDF(job) {

  const html = generateReceiptHTML(job);

  const container = document.createElement("div");
  container.innerHTML = html;

  document.body.appendChild(container);

  const element = container.firstElementChild;

  // ✅ FORCE DOWNLOAD
  html2pdf()
    .set({
      margin: 5,
      filename: `Receipt_${job.id}.pdf`,   // 👈 important
      image: { type: 'jpeg', quality: 1 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a6', orientation: 'portrait' }
    })
    .from(element)
    .save() // ✅ THIS LINE IS CRITICAL
    .then(() => {
      document.body.removeChild(container);
    });
}

function downloadReceiptPDFById(id) {

  const job = window.jobsCache.find(j => Number(j.id) === Number(id));

  if (!job) {
    alert("Job not found");
    return;
  }

  downloadReceiptPDF(job);
}

async function loadMaterialRolls(materialId) {
  const res = await fetch(`/api/materials/${materialId}/rolls`);
  const rolls = await res.json();

  console.log("ROLLS:", rolls);
}

function generateReceiptImage(job) {

  const html = generateReceiptHTML(job);

  const container = document.createElement("div");
  container.innerHTML = html;

  container.style.position = "fixed";
  container.style.left = "-9999px";

  document.body.appendChild(container);

  const element = container.firstElementChild;

  // 🔥 WAIT FOR ALL IMAGES
  const images = element.querySelectorAll("img");

  let loaded = 0;

  if (images.length === 0) {
    capture();
  } else {
    images.forEach(img => {
      if (img.complete) {
        loaded++;
        if (loaded === images.length) capture();
      } else {
        img.onload = () => {
          loaded++;
          if (loaded === images.length) capture();
        };
        img.onerror = () => {
          loaded++;
          if (loaded === images.length) capture();
        };
      }
    });
  }

  function capture() {
    html2canvas(element, {
      scale: 2,
      useCORS: true
    }).then(canvas => {

      const imgData = canvas.toDataURL("image/png");

      const link = document.createElement("a");
      link.href = imgData;
      link.download = `Receipt_${job.id}.png`;
      link.click();

      document.body.removeChild(container);
    });
  }
}

function addToCart(product) {

  if (!product) {
    alert("Invalid product");
    return;
  }

  cart.push({
    id: product.id,
    service: product.name,
    price: Number(product.price) || 0
  });

  console.log("🛒 Cart:", cart);

  renderCart();
}

function sendReceiptImageWhatsAppById(id) {

  const job = window.jobsCache.find(j => Number(j.id) === Number(id));

  if (!job) {
    alert("Job not found");
    return;
  }

  // 1️⃣ Generate image first
  generateReceiptImage(job);

  // 2️⃣ Prepare WhatsApp message
  let phone = job.customer_phone?.replace(/\D/g, "");

  if (phone.startsWith("0")) {
    phone = "233" + phone.slice(1);
  }

  const message = `
📄 Your receipt is ready.

Customer: ${job.customer_name || ''}
Service: ${job.service}

👉 Please attach the downloaded receipt image.
Thank you 🙏
  `;

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  // 3️⃣ Open WhatsApp
  setTimeout(() => {
    window.open(url, "_blank");
  }, 800);
}

document.getElementById('jobDate').value =
  new Date().toISOString().slice(0,10);

    </script>
