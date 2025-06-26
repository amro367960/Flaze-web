import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { type InsertReview } from "@shared/schema";

// Admin middleware to verify admin access
const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ message: "Unauthorized: Admin access required" });
  }
  
  try {
    // Extract credentials from Basic Auth header
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');
    
    const isAdmin = await storage.verifyAdmin(username, password);
    
    if (!isAdmin) {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }
    
    next();
  } catch (error) {
    return res.status(500).json({ message: "Authentication error" });
  }
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Get all products
  app.get("/api/products", async (req, res) => {
    try {
      const products = await storage.getAllProducts();
      res.json(products);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  // Get featured products
  app.get("/api/products/featured", async (req, res) => {
    try {
      const featuredProducts = await storage.getFeaturedProducts();
      res.json(featuredProducts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch featured products" });
    }
  });

  // Get product by ID
  app.get("/api/products/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid product ID" });
      }
      
      const product = await storage.getProduct(id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      res.json(product);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  // Get cart items
  app.get("/api/cart", async (req, res) => {
    try {
      // In a real app, you'd get userId from session
      const cartItems = await storage.getCartItems();
      const products = await storage.getAllProducts();
      
      // Combine cart items with product details
      const cartWithDetails = await Promise.all(
        cartItems.map(async (item) => {
          const product = products.find(p => p.id === item.productId);
          return {
            ...item,
            product: product || null
          };
        })
      );
      
      res.json(cartWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch cart items" });
    }
  });

  // Add item to cart
  app.post("/api/cart", async (req, res) => {
    try {
      const cartItemSchema = z.object({
        productId: z.number(),
        size: z.string(),
        quantity: z.number().optional().default(1),
        userId: z.number().optional().nullable()
      });
      
      const parsedBody = cartItemSchema.safeParse(req.body);
      
      if (!parsedBody.success) {
        return res.status(400).json({ 
          message: "Invalid cart item data",
          errors: parsedBody.error.errors 
        });
      }
      
      const newCartItem = await storage.addToCart(parsedBody.data);
      res.status(201).json(newCartItem);
    } catch (error) {
      res.status(500).json({ message: "Failed to add item to cart" });
    }
  });

  // Update cart item quantity
  app.patch("/api/cart/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid cart item ID" });
      }
      
      const quantitySchema = z.object({
        quantity: z.number().int().positive()
      });
      
      const parsedBody = quantitySchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ 
          message: "Invalid quantity",
          errors: parsedBody.error.errors 
        });
      }
      
      const updatedItem = await storage.updateCartItemQuantity(id, parsedBody.data.quantity);
      
      if (!updatedItem) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      
      res.json(updatedItem);
    } catch (error) {
      res.status(500).json({ message: "Failed to update cart item" });
    }
  });

  // Remove item from cart
  app.delete("/api/cart/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid cart item ID" });
      }
      
      const success = await storage.removeFromCart(id);
      
      if (!success) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to remove item from cart" });
    }
  });

  // Clear cart
  app.delete("/api/cart", async (req, res) => {
    try {
      // In a real app, you'd get userId from session
      await storage.clearCart();
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to clear cart" });
    }
  });

  // === Reviews API ===
  
  // Get all approved reviews (public)
  app.get("/api/reviews", async (req, res) => {
    try {
      const reviews = await storage.getApprovedReviews();
      res.json(reviews);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });
  
  // Submit a new review (public)
  app.post("/api/reviews", async (req, res) => {
    try {
      const reviewSchema = z.object({
        name: z.string().min(1, "Name is required"),
        rating: z.number().int().min(1).max(5),
        comment: z.string().optional().default("")
      });
      
      const parsedBody = reviewSchema.safeParse(req.body);
      
      if (!parsedBody.success) {
        return res.status(400).json({ 
          message: "Invalid review data",
          errors: parsedBody.error.errors 
        });
      }
      
      const newReview = await storage.createReview(parsedBody.data);
      res.status(201).json(newReview);
    } catch (error) {
      res.status(500).json({ message: "Failed to submit review" });
    }
  });
  
  // === Admin API ===
  
  // Get all reviews (including unapproved) - admin only
  app.get("/api/admin/reviews", requireAdmin, async (req, res) => {
    try {
      const reviews = await storage.getAllReviews();
      res.json(reviews);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });
  
  // Update review approval status - admin only
  app.patch("/api/admin/reviews/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid review ID" });
      }
      
      const approvalSchema = z.object({
        approved: z.boolean()
      });
      
      const parsedBody = approvalSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ 
          message: "Invalid approval status",
          errors: parsedBody.error.errors 
        });
      }
      
      const updatedReview = await storage.updateReview(id, parsedBody.data.approved);
      
      if (!updatedReview) {
        return res.status(404).json({ message: "Review not found" });
      }
      
      res.json(updatedReview);
    } catch (error) {
      res.status(500).json({ message: "Failed to update review" });
    }
  });
  
  // Delete a review - admin only
  app.delete("/api/admin/reviews/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid review ID" });
      }
      
      const success = await storage.deleteReview(id);
      
      if (!success) {
        return res.status(404).json({ message: "Review not found" });
      }
      
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete review" });
    }
  });
  
  // Update product - admin only
  app.patch("/api/admin/products/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid product ID" });
      }
      
      const productSchema = z.object({
        name: z.string().optional(),
        description: z.string().optional(),
        price: z.string().optional(),
        image: z.string().optional(),
        sizes: z.array(z.string()).optional(),
        badge: z.string().nullable().optional()
      });
      
      const parsedBody = productSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ 
          message: "Invalid product data",
          errors: parsedBody.error.errors 
        });
      }
      
      const updatedProduct = await storage.updateProduct(id, parsedBody.data);
      
      if (!updatedProduct) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      res.json(updatedProduct);
    } catch (error) {
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
