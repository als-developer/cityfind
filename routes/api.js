
---

## 15. routes/api.js

```javascript
const express = require('express');
const router = express.Router();

let products = [
  { id: 1, name: 'Premium Organic Coffee Beans', price: 18.00, category: 'food', stock: 50, lat: -3.3667, lng: 36.6833 },
  { id: 2, name: 'Organic Avocado Oil', price: 12.00, category: 'food', stock: 30, lat: -1.2921, lng: 36.8219 },
  { id: 3, name: 'Premium Leather Jacket', price: 187.50, category: 'fashion', stock: 15, lat: 5.6037, lng: -0.1870 }
];

let users = [
  { id: 1, name: 'Ali Hassan', email: 'ali@cityfind.com', role: 'admin' },
  { id: 2, name: 'Sarah K.', email: 'sarah@cityfind.com', role: 'seller' },
  { id: 3, name: 'John M.', email: 'john@cityfind.com', role: 'buyer' }
];

// GET all products
router.get('/products', (req, res) => {
  res.json({ success: true, data: products });
});

// GET product by ID
router.get('/products/:id', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  res.json({ success: true, data: product });
});

// POST new product
router.post('/products', (req, res) => {
  const { name, price, category, stock, lat, lng } = req.body;
  if (!name || !price) {
    return res.status(400).json({ success: false, message: 'Name and price required' });
  }
  const newProduct = {
    id: products.length + 1,
    name,
    price,
    category: category || 'general',
    stock: stock || 0,
    lat: lat || 0,
    lng: lng || 0
  };
  products.push(newProduct);
  res.status(201).json({ success: true, data: newProduct });
});

// PUT update product
router.put('/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = products.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  products[index] = { ...products[index], ...req.body };
  res.json({ success: true, data: products[index] });
});

// DELETE product
router.delete('/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = products.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  products.splice(index, 1);
  res.json({ success: true, message: 'Product deleted' });
});

// GET users
router.get('/users', (req, res) => {
  res.json({ success: true, data: users });
});

// GET stats
router.get('/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      totalUsers: users.length,
      totalProducts: products.length,
      totalRevenue: 89456,
      totalOrders: 1234
    }
  });
});

module.exports = router;
