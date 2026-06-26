const express = require('express');
const router = express.Router();

let deliveries = [
  { id: 1, orderId: 101, status: 'pending', location: 'Mikocheni', eta: '12 min' },
  { id: 2, orderId: 102, status: 'in-transit', location: 'Oysterbay', eta: '25 min' },
  { id: 3, orderId: 103, status: 'delivered', location: 'Mlimani City', eta: '0 min' }
];

router.get('/deliveries', (req, res) => {
  res.json({ success: true, data: deliveries });
});

router.get('/deliveries/:id', (req, res) => {
  const delivery = deliveries.find(d => d.id === parseInt(req.params.id));
  if (!delivery) {
    return res.status(404).json({ success: false, message: 'Delivery not found' });
  }
  res.json({ success: true, data: delivery });
});

router.post('/deliveries/:id/status', (req, res) => {
  const id = parseInt(req.params.id);
  const index = deliveries.findIndex(d => d.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Delivery not found' });
  }
  deliveries[index].status = req.body.status || deliveries[index].status;
  if (req.body.location) deliveries[index].location = req.body.location;
  if (req.body.eta) deliveries[index].eta = req.body.eta;
  res.json({ success: true, data: deliveries[index] });
});

router.get('/stats', (req, res) => {
  const total = deliveries.length;
  const pending = deliveries.filter(d => d.status === 'pending').length;
  const inTransit = deliveries.filter(d => d.status === 'in-transit').length;
  const delivered = deliveries.filter(d => d.status === 'delivered').length;
  
  res.json({
    success: true,
    data: { total, pending, inTransit, delivered }
  });
});

module.exports = router;
