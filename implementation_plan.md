# Introduce Product Variations (Colors & Sizes)

The goal of this task is to allow admins to define variations (different colors and sizes) for products. Each variation can have its own specific price, MRP, and stock level. Customers will then be able to browse these variations on the product details page and add the selected variant to their cart natively.

## User Review Required

> [!IMPORTANT]
> **Admin Dashboard Design:** I will update the "Add/Edit Product" screen in the admin dashboard to include a "Variations" builder section. An admin can add multiple variations where each variation specifies a "Color", "Size", "Price", and "MRP". Please review if this meets your requirements or if there are other dynamic fields (like Weight) you'd like per variation.

> [!IMPORTANT]
> **Variation Selection UX:** On the product details page, I will render selection buttons for available sizes and colors. The main price and MRP shown on the page will dynamically update based on the selected variant. 

## Proposed Changes

---

### Backend Models Layer
Adds support for storing variation properties.

#### [MODIFY] `backend/models/Product.js`
- Append a `variations` schema array to track: `{ color: String, size: String, price: Number, mrp: Number, stock: Number }`.

#### [MODIFY] `backend/models/Order.js`
- Update `orderItemSchema` to store the selected variation properties, specifically `variationId`, `size`, and `color`. 

---

### Backend API Layer
Updates order placement logic to factor in the variation's specific price and stock.

#### [MODIFY] `backend/routes/orders.js`
- In the `POST /` (place order) endpoint, adjust the validation logic. If an `item.variationId` is passed, fetch the specific price from that variation rather than the base product price.
- Deduct the inventory/stock from the selected variation, instead of (or alongside) the overarching product.

---

### Admin Frontend
UI to manage product variants.

#### [MODIFY] `frontend/pages/admin.html`
- Add a new "Variations" block inside the Product Form (below base price/MRP). This dynamic builder allows adding multiple rows for Size, Color, Price, and MRP.

#### [MODIFY] `frontend/js/admin.js`
- Wire up the logic to add/remove variation rows in the UI and marshal this data into the payload when creating or updating a product via `API.createProduct()` or `API.updateProduct()`.

---

### Storefront Frontend
UI for users to select variants and cart tracking.

#### [MODIFY] `frontend/pages/product.html`
- Inside the product information section (near Price/Qty), introduce DOM placeholders for the **Color Selector** and **Size Selector**. 

#### [MODIFY] `frontend/js/product-detail.js`
- In `renderProduct()`, dynamically build the color and size selection chips.
- Add event listeners so that when a user selects a different variation, the large display Price, MRP, and "Add to Cart" state appropriately reflect the selected variation.
- Pass the selected variation's ID alongside the product to `Cart.add()`.

#### [MODIFY] `frontend/js/cart.js`
- Update `Cart.add` so that items are differentiated in the cart not just by `productId`, but by `variationId` (e.g. `items.findIndex(i => i.variationId === variationId)`).
- Ensure the cart visually displays the chosen Size and Color.

#### [MODIFY] `frontend/js/cart-page.js` & `frontend/css/style.css`
- Ensure that the cart overview and checkout summaries cleanly print out the "Size: L | Color: Red" info beneath the product title. Provide relevant CSS styling for the variant choice chips.

## Open Questions

- If a product has variations defined, do you want the "base" price to be hidden entirely in favor of showing the first variation's price by default? 
- Will all variations share the same subset of images, or did you want image selection specific to colors? (For this phase, I'm assuming variants share the product's image gallery to keep it straightforward).

## Verification Plan

### Automated Tests
- N/A (We will rely on manual testing in the application).

### Manual Verification
1. Open Admin Panel -> Add a new product -> Add variations (e.g. Red-S-₹500, Blue-M-₹600).
2. Save product and verify it correctly appears in the Product listing.
3. Open the product details page in the storefront -> Ensure size/color chips render accurately and updating them changes the price.
4. Add different variations of the same product to the cart -> Verify they appear as distinct items in the cart with their specific prices.
5. Provide fake address and complete the checkout -> Check the "Complete Dashboard" and verify the correct price and variant specs were recorded into the database.
