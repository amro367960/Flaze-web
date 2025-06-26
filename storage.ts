import { 
  products, users, reviews,
  type Product, type InsertProduct, 
  type User, type InsertUser,
  type Review, type InsertReview,
  type CartItem, type InsertCartItem
} from "@shared/schema";

export interface IStorage {
  // Product methods
  getAllProducts(): Promise<Product[]>;
  getFeaturedProducts(): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;

  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  verifyAdmin(username: string, password: string): Promise<boolean>;

  // Review methods
  getAllReviews(): Promise<Review[]>;
  getApprovedReviews(): Promise<Review[]>;
  getReview(id: number): Promise<Review | undefined>;
  createReview(review: InsertReview): Promise<Review>;
  updateReview(id: number, approved: boolean): Promise<Review | undefined>;
  deleteReview(id: number): Promise<boolean>;

  // Legacy Cart methods (for backward compatibility)
  getCartItems(userId?: number): Promise<CartItem[]>;
  addToCart(cartItem: InsertCartItem): Promise<CartItem>;
  updateCartItemQuantity(id: number, quantity: number): Promise<CartItem | undefined>;
  removeFromCart(id: number): Promise<boolean>;
  clearCart(userId?: number): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private products: Map<number, Product>;
  private cart: Map<number, CartItem>;
  private reviews: Map<number, Review>;
  
  currentUserId: number;
  currentProductId: number;
  currentCartItemId: number;
  currentReviewId: number;

  constructor() {
    this.users = new Map();
    this.products = new Map();
    this.cart = new Map();
    this.reviews = new Map();
    
    this.currentUserId = 1;
    this.currentProductId = 1;
    this.currentCartItemId = 1;
    this.currentReviewId = 1;

    // Create admin user
    this.createUser({
      username: "admin",
      password: "admin123" // This should be hashed in a real app
    }).then(user => {
      // Update user to be an admin
      this.users.set(user.id, { ...user, isAdmin: true });
    });

    // Initialize with a single featured product (as per requirements)
    this.seedProducts();
  }

  private seedProducts() {
    // As per requirements, only display one product
    const product: InsertProduct = {
      name: "Flaze Heated Lunch Box",
      description: "Premium heated lunch box with temperature control. Keep your meals warm anywhere you go.",
      price: "59.99",
      image: "",  // Image will be updated later
      rating: "5.0",
      reviewCount: 0,
      badge: "New",
      sizes: ["S", "M", "L"],
      featured: true,
    };

    this.createProduct(product);
  }

  // Product methods
  async getAllProducts(): Promise<Product[]> {
    return Array.from(this.products.values());
  }

  async getFeaturedProducts(): Promise<Product[]> {
    return Array.from(this.products.values()).filter(product => product.featured);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    return this.products.get(id);
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const id = this.currentProductId++;
    const product: Product = { 
      id,
      name: insertProduct.name,
      description: insertProduct.description,
      price: insertProduct.price,
      image: insertProduct.image,
      rating: insertProduct.rating,
      reviewCount: insertProduct.reviewCount || 0,
      badge: insertProduct.badge || null,
      sizes: insertProduct.sizes,
      featured: insertProduct.featured !== undefined ? insertProduct.featured : true
    };
    this.products.set(id, product);
    return product;
  }
  
  async updateProduct(id: number, updateData: Partial<InsertProduct>): Promise<Product | undefined> {
    const product = this.products.get(id);
    if (!product) return undefined;
    
    const updatedProduct = { 
      ...product,
      ...updateData,
      // Ensure these fields maintain correct types
      reviewCount: updateData.reviewCount !== undefined ? updateData.reviewCount : product.reviewCount,
      badge: updateData.badge !== undefined ? updateData.badge : product.badge,
      featured: updateData.featured !== undefined ? updateData.featured : product.featured
    };
    
    this.products.set(id, updatedProduct);
    return updatedProduct;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { 
      ...insertUser, 
      id,
      isAdmin: false // Default to non-admin user 
    };
    this.users.set(id, user);
    return user;
  }
  
  async verifyAdmin(username: string, password: string): Promise<boolean> {
    const user = await this.getUserByUsername(username);
    if (!user) return false;
    
    // In a real application, you would use proper password hashing
    return user.password === password && user.isAdmin;
  }
  
  // Review methods
  async getAllReviews(): Promise<Review[]> {
    return Array.from(this.reviews.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  async getApprovedReviews(): Promise<Review[]> {
    return Array.from(this.reviews.values())
      .filter(review => review.approved)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  async getReview(id: number): Promise<Review | undefined> {
    return this.reviews.get(id);
  }
  
  async createReview(insertReview: InsertReview): Promise<Review> {
    const id = this.currentReviewId++;
    const review: Review = {
      id,
      name: insertReview.name,
      rating: insertReview.rating,
      comment: insertReview.comment || "",
      approved: true, // Default reviews to approved
      createdAt: new Date().toISOString()
    };
    this.reviews.set(id, review);
    
    // Update product rating based on reviews
    this.updateProductRatings();
    
    return review;
  }
  
  async updateReview(id: number, approved: boolean): Promise<Review | undefined> {
    const review = this.reviews.get(id);
    if (!review) return undefined;
    
    const updatedReview = { ...review, approved };
    this.reviews.set(id, updatedReview);
    
    // Update product rating based on approved reviews
    this.updateProductRatings();
    
    return updatedReview;
  }
  
  async deleteReview(id: number): Promise<boolean> {
    const deleted = this.reviews.delete(id);
    
    // Update product rating based on reviews if a review was deleted
    if (deleted) {
      this.updateProductRatings();
    }
    
    return deleted;
  }
  
  // Helper method to update product ratings based on reviews
  private updateProductRatings(): void {
    // For simplicity, we'll update the rating of the first product 
    // since we're only displaying one product as per requirements
    const product = Array.from(this.products.values())[0];
    if (!product) return;
    
    const approvedReviews = Array.from(this.reviews.values())
      .filter(review => review.approved);
    
    if (approvedReviews.length === 0) return;
    
    // Calculate average rating
    const totalRating = approvedReviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = (totalRating / approvedReviews.length).toFixed(1);
    
    // Update product
    this.updateProduct(product.id, {
      rating: averageRating,
      reviewCount: approvedReviews.length
    });
  }

  // Cart methods
  async getCartItems(userId?: number): Promise<CartItem[]> {
    if (userId) {
      return Array.from(this.cart.values()).filter(item => item.userId === userId);
    }
    return Array.from(this.cart.values()).filter(item => item.userId === undefined);
  }

  async addToCart(insertCartItem: InsertCartItem): Promise<CartItem> {
    // Check if the same product and size combo exists for the user
    const existingItem = Array.from(this.cart.values()).find(
      item => 
        item.productId === insertCartItem.productId && 
        item.size === insertCartItem.size &&
        item.userId === insertCartItem.userId
    );

    if (existingItem) {
      // Update quantity of existing item
      return this.updateCartItemQuantity(
        existingItem.id, 
        existingItem.quantity + (insertCartItem.quantity || 1)
      ) as Promise<CartItem>;
    }

    // Otherwise create a new cart item
    const id = this.currentCartItemId++;
    const cartItem: CartItem = { ...insertCartItem, id };
    this.cart.set(id, cartItem);
    return cartItem;
  }

  async updateCartItemQuantity(id: number, quantity: number): Promise<CartItem | undefined> {
    const cartItem = this.cart.get(id);
    if (!cartItem) return undefined;

    const updatedItem = { ...cartItem, quantity };
    this.cart.set(id, updatedItem);
    return updatedItem;
  }

  async removeFromCart(id: number): Promise<boolean> {
    return this.cart.delete(id);
  }

  async clearCart(userId?: number): Promise<boolean> {
    if (userId) {
      // Clear only items for this user
      Array.from(this.cart.entries())
        .filter(([_, item]) => item.userId === userId)
        .forEach(([id, _]) => this.cart.delete(id));
    } else {
      // Clear guest cart items
      Array.from(this.cart.entries())
        .filter(([_, item]) => item.userId === undefined)
        .forEach(([id, _]) => this.cart.delete(id));
    }
    return true;
  }
}

export const storage = new MemStorage();
