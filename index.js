const express = require("express");
const app = express();
require("dotenv").config();

// Stripe Safe Initialization
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || process.env.STRIP_SECRET_KEY;
const stripe = stripeSecretKey ? require("stripe")(stripeSecretKey) : null;

const jwt = require("jsonwebtoken");
const cors = require("cors");
const port = process.env.PORT || 9000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// Middlewares
app.use(express.json());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        "https://collaborative-study-plat-312b7.web.app",
        "https://collaborative-study-plat-312b7.firebaseapp.com",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
      ];
      
      if (
        allowedOrigins.includes(origin) ||
        /^http:\/\/localhost:\d+$/.test(origin) ||
        /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

// Safe Lazy MongoDB Client Helper
let cachedClient = null;
let cachedDb = null;

function getDatabase() {
  const dbUser = process.env.DB_USER;
  const dbPass = process.env.DB_PASS;

  if (!dbUser || !dbPass) {
    throw new Error(
      "Missing MongoDB credentials (DB_USER or DB_PASS) in Environment Variables. Please check your .env file or Vercel Environment Variables."
    );
  }

  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const uri = `mongodb+srv://${encodeURIComponent(dbUser)}:${encodeURIComponent(
    dbPass
  )}@cluster0.ybjyx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

  cachedClient = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  cachedDb = cachedClient.db("collaborative-study");
  return { client: cachedClient, db: cachedDb };
}

// Collections helper
function getCollections() {
  const { db } = getDatabase();
  return {
    studySessionCollection: db.collection("studySession"),
    userCollection: db.collection("users"),
    uploadMaterialsCollection: db.collection("materials"),
    bookedSessionsCollection: db.collection("booked-sessions"),
    studentReviewCollection: db.collection("student-review"),
    studentNoteCollection: db.collection("student-notes"),
  };
}

// Health check / Root Route with live MongoDB test
app.get("/", async (req, res) => {
  let dbStatus = "disconnected";
  let dbError = null;
  let userCount = 0;
  
  try {
    const { client, db } = getDatabase();
    await client.db("admin").command({ ping: 1 });
    dbStatus = "connected";
    userCount = await db.collection("users").countDocuments();
  } catch (err) {
    dbError = err.message;
  }

  const hasStripeConfig = !!(process.env.STRIPE_SECRET_KEY || process.env.STRIP_SECRET_KEY);
  res.send({
    message: "Collaborative Study Server is Running",
    status: dbStatus === "connected" ? "healthy" : "degraded",
    database: {
      status: dbStatus,
      name: "collaborative-study",
      usersInDb: userCount,
      error: dbError,
    },
    stripeConfigured: hasStripeConfig,
  });
});

// ================= JWT =================
app.post("/jwt", async (req, res) => {
  try {
    const user = req.body;
    const secret = process.env.ACCESS_TOKEN_SECRET || "fallback_collaborative_secret_key_2025";
    const token = jwt.sign(user, secret, {
      expiresIn: "7d",
    });
    res.send({ token });
  } catch (error) {
    console.error("JWT creation error:", error);
    res.status(500).send({ message: "Failed to create token" });
  }
});

// ================= verifyToken Middleware =================
const verifyToken = (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "Unauthorized access: Missing token" });
  }
  const token = req.headers.authorization.split(" ")[1];
  const secret = process.env.ACCESS_TOKEN_SECRET || "fallback_collaborative_secret_key_2025";
  jwt.verify(token, secret, (error, decoded) => {
    if (error) {
      return res.status(401).send({ message: "Unauthorized access: Invalid or expired token" });
    }
    req.decoded = decoded;
    next();
  });
};

// ================= User APIs =================
// Public tutors endpoint for homepage showcase
app.get(["/tutors", "/public-tutors"], async (req, res) => {
  try {
    const { userCollection } = getCollections();
    const result = await userCollection
      .find({ role: { $regex: /^tutor$/i } })
      .project({ name: 1, email: 1, image: 1, role: 1 })
      .toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching tutors:", error);
    res.status(500).send({ error: error.message || "Failed to fetch tutors" });
  }
});

app.get("/users", verifyToken, async (req, res) => {
  try {
    const { userCollection } = getCollections();
    const result = await userCollection.find().toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).send({ error: error.message || "Failed to fetch users" });
  }
});

// User role API (supports multiple aliases and case-insensitive email search)
app.get(["/user/admin/:email", "/user/role/:email", "/users/role/:email"], async (req, res) => {
  try {
    const rawEmail = req.params.email?.trim();
    if (!rawEmail) {
      return res.send({ role: "student", admin: false });
    }
    const { userCollection } = getCollections();
    const escapedEmail = rawEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const query = { email: { $regex: new RegExp(`^${escapedEmail}$`, "i") } };
    const result = await userCollection.findOne(query);
    const userRole = (result?.role || "student").toLowerCase().trim();
    res.send({ role: userRole, admin: userRole === "admin" });
  } catch (error) {
    console.error("Error fetching user role:", error);
    res.status(500).send({ error: error.message || "Failed to fetch user role" });
  }
});

// User information save (first time or login sync)
app.post("/users", async (req, res) => {
  try {
    const user = req.body;
    const rawEmail = user.email?.trim();
    if (!rawEmail) {
      return res.status(400).send({ error: "Email is required" });
    }
    const { userCollection } = getCollections();
    const escapedEmail = rawEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const query = { email: { $regex: new RegExp(`^${escapedEmail}$`, "i") } };
    const existingUser = await userCollection.findOne(query);
    if (existingUser) {
      return res.send({
        message: "User already exists",
        insertedId: null,
        role: existingUser.role || "student",
      });
    }
    const result = await userCollection.insertOne({
      ...user,
      email: rawEmail,
      role: (user.role || "student").toLowerCase().trim(),
      createdAt: new Date().toISOString(),
    });
    res.send(result);
  } catch (error) {
    console.error("Error saving user:", error);
    res.status(500).send({ error: error.message || "Failed to save user" });
  }
});

// Update user role (student, tutor, admin)
app.patch("/users/role/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { role } = req.body;
    const sanitizedRole = (role || "student").toLowerCase().trim();
    const { userCollection } = getCollections();
    const query = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: { role: sanitizedRole },
    };
    const result = await userCollection.updateOne(query, updateDoc);
    res.send(result);
  } catch (error) {
    console.error("Error updating role:", error);
    res.status(500).send({ error: error.message || "Failed to update role" });
  }
});

// Delete user API (Admin capability)
app.delete("/users/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || !ObjectId.isValid(id)) {
      return res.status(400).send({ error: "Invalid user ID" });
    }
    const { userCollection } = getCollections();
    const query = { _id: new ObjectId(id) };
    const result = await userCollection.deleteOne(query);
    res.send(result);
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).send({ error: error.message || "Failed to delete user" });
  }
});

// ================= Study Session APIs =================
app.get("/studySession", async (req, res) => {
  try {
    const { studySessionCollection } = getCollections();
    const result = await studySessionCollection.find().toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching study sessions:", error);
    res.status(500).send({ error: error.message || "Failed to fetch study sessions" });
  }
});

app.get("/study/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { studySessionCollection } = getCollections();
    const query = { _id: new ObjectId(id) };
    const result = await studySessionCollection.findOne(query);
    res.send(result);
  } catch (error) {
    console.error("Error fetching single study session:", error);
    res.status(500).send({ error: error.message || "Failed to fetch session" });
  }
});

app.get("/studySession/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const { studySessionCollection } = getCollections();
    const filter = { tutorEmail: email };
    const result = await studySessionCollection.find(filter).toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching tutor sessions:", error);
    res.status(500).send({ error: error.message || "Failed to fetch tutor sessions" });
  }
});

app.patch("/sessions/reject/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { rejectionReason } = req.body;
    const { studySessionCollection } = getCollections();
    const query = { _id: new ObjectId(id) };
    const update = {
      $set: {
        status: "reject",
        rejectionReason: rejectionReason || "No reason provided",
      },
    };
    const result = await studySessionCollection.updateOne(query, update);
    res.send(result);
  } catch (error) {
    console.error("Error rejecting session:", error);
    res.status(500).send({ error: error.message || "Failed to reject session" });
  }
});

app.patch("/studySession/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;

    if (status !== "pending") {
      return res
        .status(400)
        .send({ message: "Invalid status. Only 'pending' is allowed." });
    }

    const { studySessionCollection } = getCollections();
    const query = { _id: new ObjectId(id) };
    const update = {
      $set: { status: "pending" },
    };

    const result = await studySessionCollection.updateOne(query, update);
    res.send(result);
  } catch (error) {
    console.error("Error updating session status:", error);
    res.status(500).send({ error: error.message || "Failed to update session status" });
  }
});

app.patch("/sessions/success/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { registrationFee } = req.body;
    const { studySessionCollection } = getCollections();
    const query = { _id: new ObjectId(id) };
    const update = {
      $set: { status: "success", registrationFee: Number(registrationFee) },
    };
    const result = await studySessionCollection.updateOne(query, update);
    res.send(result);
  } catch (error) {
    console.error("Error approving session:", error);
    res.status(500).send({ error: error.message || "Failed to approve session" });
  }
});

app.delete("/deleted/session/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { studySessionCollection } = getCollections();
    const query = { _id: new ObjectId(id) };
    const result = await studySessionCollection.deleteOne(query);
    res.send(result);
  } catch (error) {
    console.error("Error deleting session:", error);
    res.status(500).send({ error: error.message || "Failed to delete session" });
  }
});

app.post("/studySession", async (req, res) => {
  try {
    const session = req.body;
    const { studySessionCollection } = getCollections();
    const result = await studySessionCollection.insertOne(session);
    res.send(result);
  } catch (error) {
    console.error("Error creating study session:", error);
    res.status(500).send({ error: error.message || "Failed to create study session" });
  }
});

// ================= Study Materials APIs =================
app.post("/materials", async (req, res) => {
  try {
    const material = req.body;
    const { uploadMaterialsCollection } = getCollections();
    const result = await uploadMaterialsCollection.insertOne(material);
    res.send(result);
  } catch (error) {
    console.error("Error uploading material:", error);
    res.status(500).send({ error: error.message || "Failed to upload material" });
  }
});

app.get("/allMaterials", async (req, res) => {
  try {
    const { uploadMaterialsCollection } = getCollections();
    const result = await uploadMaterialsCollection.find().toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching materials:", error);
    res.status(500).send({ error: error.message || "Failed to fetch materials" });
  }
});

// Get study materials for an enrolled student (only sessions/tutors the student has booked)
app.get(["/student-materials/:email", "/materials/student/:email"], async (req, res) => {
  try {
    const studentEmail = req.params.email?.trim();
    if (!studentEmail) {
      return res.status(400).send({ error: "Student email is required" });
    }

    const { bookedSessionsCollection, uploadMaterialsCollection, studySessionCollection } = getCollections();

    // 1. Fetch all sessions booked by this student
    const bookedSessions = await bookedSessionsCollection.find({ user: studentEmail }).toArray();

    if (!bookedSessions || bookedSessions.length === 0) {
      return res.send([]);
    }

    // 2. Collect session IDs and tutor emails
    const sessionIds = [];
    const sessionObjectIds = [];
    const tutorEmails = [];

    bookedSessions.forEach((b) => {
      if (b.sessionId) {
        const sidStr = String(b.sessionId);
        sessionIds.push(sidStr);
        if (ObjectId.isValid(sidStr) && sidStr.length === 24) {
          sessionObjectIds.push(new ObjectId(sidStr));
        }
      }
      if (b.tutorEmail) {
        tutorEmails.push(b.tutorEmail);
      }
    });

    // 3. Find materials matching student's enrolled sessions or tutors
    const orConditions = [];
    if (sessionIds.length > 0) {
      orConditions.push({ sessionId: { $in: sessionIds } });
    }
    if (sessionObjectIds.length > 0) {
      orConditions.push({ sessionId: { $in: sessionObjectIds } });
    }
    if (tutorEmails.length > 0) {
      orConditions.push({ tutorEmail: { $in: tutorEmails } });
    }

    const materialsQuery = orConditions.length > 0 ? { $or: orConditions } : {};
    const materials = await uploadMaterialsCollection.find(materialsQuery).toArray();

    // 4. Enrich materials with booked session information
    const enriched = materials.map((mat) => {
      const match = bookedSessions.find(
        (b) => String(b.sessionId) === String(mat.sessionId) || b.tutorEmail === mat.tutorEmail
      );
      return {
        ...mat,
        sessionTitle: mat.sessionTitle || match?.sessionTitle || "Study Session",
        tutorName: match?.tutorName || mat.tutorName || mat.tutorEmail,
      };
    });

    res.send(enriched);
  } catch (error) {
    console.error("Error fetching enrolled student materials:", error);
    res.status(500).send({ error: error.message || "Failed to fetch student materials" });
  }
});

// Get materials for a specific session ID (with optional enrollment check)
app.get("/materials/session/:sessionId", async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const userEmail = req.query.user?.trim();
    const { uploadMaterialsCollection, bookedSessionsCollection } = getCollections();

    if (userEmail) {
      const isBooked = await bookedSessionsCollection.findOne({
        sessionId: sessionId,
        user: userEmail,
      });
      if (!isBooked) {
        return res.status(403).send({
          error: "Access denied. You must enroll in this study session to view its materials.",
          enrolled: false,
        });
      }
    }

    const query = {
      $or: [
        { sessionId: sessionId },
        ...(ObjectId.isValid(sessionId) && sessionId.length === 24 ? [{ sessionId: new ObjectId(sessionId) }] : [])
      ]
    };

    const result = await uploadMaterialsCollection.find(query).toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching session materials:", error);
    res.status(500).send({ error: error.message || "Failed to fetch session materials" });
  }
});

app.get("/materials/:identifier", async (req, res) => {
  try {
    const identifier = req.params.identifier;
    const { uploadMaterialsCollection } = getCollections();
    if (ObjectId.isValid(identifier) && identifier.length === 24) {
      const singleMaterial = await uploadMaterialsCollection.findOne({ _id: new ObjectId(identifier) });
      if (singleMaterial) {
        return res.send(singleMaterial);
      }
    }
    const filter = { tutorEmail: identifier };
    const result = await uploadMaterialsCollection.find(filter).toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching materials by identifier:", error);
    res.status(500).send({ error: error.message || "Failed to fetch materials" });
  }
});

app.delete("/materials/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { uploadMaterialsCollection } = getCollections();
    const query = { _id: new ObjectId(id) };
    const result = await uploadMaterialsCollection.deleteOne(query);
    res.send(result);
  } catch (error) {
    console.error("Error deleting material:", error);
    res.status(500).send({ error: error.message || "Failed to delete material" });
  }
});

const updateMaterialHandler = async (req, res) => {
  try {
    const id = req.params.id;
    const { _id, ...materials } = req.body;
    const { uploadMaterialsCollection } = getCollections();
    const filter = { _id: new ObjectId(id) };
    const update = {
      $set: materials,
    };
    const result = await uploadMaterialsCollection.updateOne(filter, update);
    res.send(result);
  } catch (error) {
    console.error("Error updating material:", error);
    res.status(500).send({ error: error.message || "Failed to update material" });
  }
};

app.patch("/materials/:id", updateMaterialHandler);
app.put("/materials/:id", updateMaterialHandler);
app.put("/material/:id", updateMaterialHandler);

// ================= Student Booked Sessions APIs =================
app.post("/booked-sessions", async (req, res) => {
  try {
    const { sessionId, user, ...data } = req.body;
    const query = { sessionId, user };
    const { bookedSessionsCollection } = getCollections();

    const existingSession = await bookedSessionsCollection.findOne(query);
    if (existingSession) {
      return res.send({ message: "Session already booked", session: existingSession });
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}-${randomSuffix}`;
    const fee = parseFloat(data.registrationFee) || 0;
    const bookingDate = data.bookingDate || new Date().toISOString();

    const newBooking = {
      sessionId,
      user,
      invoiceNumber,
      bookingDate,
      registrationFee: fee,
      paymentStatus: fee > 0 ? "Paid" : "Free",
      ...data,
    };

    const result = await bookedSessionsCollection.insertOne(newBooking);
    res.send({ ...result, invoiceNumber, booking: { ...newBooking, _id: result.insertedId } });
  } catch (error) {
    console.error("Error booking session:", error);
    res.status(500).send({ error: error.message || "Failed to book session" });
  }
});

app.get("/booked-sessions", async (req, res) => {
  try {
    const { bookedSessionsCollection } = getCollections();
    const result = await bookedSessionsCollection.find().sort({ _id: -1 }).toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching booked sessions:", error);
    res.status(500).send({ error: error.message || "Failed to fetch booked sessions" });
  }
});

// Admin Sales & Revenue Analytics API
app.get("/admin/sales-analytics", async (req, res) => {
  try {
    const { bookedSessionsCollection } = getCollections();
    const bookings = await bookedSessionsCollection.find().sort({ _id: -1 }).toArray();

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    let totalRevenue = 0;
    let thisMonthRevenue = 0;
    let paidBookings = 0;
    let freeBookings = 0;

    // Monthly bucket structure (initialize all 12 months for current year)
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const monthlyMap = {};
    monthNames.forEach((name, index) => {
      monthlyMap[index] = {
        month: name,
        monthIndex: index,
        revenue: 0,
        bookings: 0,
        paid: 0,
        free: 0,
      };
    });

    const enrichedTransactions = bookings.map((item, index) => {
      const fee = parseFloat(item.registrationFee) || 0;
      const bDate = item.bookingDate ? new Date(item.bookingDate) : new Date();
      const invoiceNumber = item.invoiceNumber || `INV-${String(index + 1).padStart(5, '0')}`;
      const isPaid = fee > 0;

      totalRevenue += fee;
      if (isPaid) {
        paidBookings++;
      } else {
        freeBookings++;
      }

      // Check if booking is in current month & year
      if (bDate.getFullYear() === currentYear && bDate.getMonth() === currentMonth) {
        thisMonthRevenue += fee;
      }

      // Aggregate into monthly stats if in current year
      const bMonth = bDate.getMonth();
      if (monthlyMap[bMonth]) {
        monthlyMap[bMonth].revenue += fee;
        monthlyMap[bMonth].bookings += 1;
        if (isPaid) {
          monthlyMap[bMonth].paid += 1;
        } else {
          monthlyMap[bMonth].free += 1;
        }
      }

      return {
        ...item,
        invoiceNumber,
        registrationFee: fee,
        paymentStatus: isPaid ? "Paid" : "Free",
        bookingDateFormatted: bDate.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
      };
    });

    const monthlyStats = Object.values(monthlyMap);

    res.send({
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        thisMonthRevenue: Math.round(thisMonthRevenue * 100) / 100,
        totalBookings: bookings.length,
        paidBookings,
        freeBookings,
        currentYear,
        currentMonthName: monthNames[currentMonth],
      },
      monthlyStats,
      transactions: enrichedTransactions,
    });
  } catch (error) {
    console.error("Error fetching sales analytics:", error);
    res.status(500).send({ error: error.message || "Failed to fetch sales analytics" });
  }
});

app.get("/booked-sessions/:sessionId", async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const userEmail = req.query.user;
    const { bookedSessionsCollection } = getCollections();
    if (userEmail) {
      const existing = await bookedSessionsCollection.findOne({ sessionId, user: userEmail });
      return res.send({ isBooked: !!existing, session: existing });
    }
    const result = await bookedSessionsCollection.find({ sessionId }).toArray();
    res.send(result);
  } catch (error) {
    console.error("Error checking session booking status:", error);
    res.status(500).send({ error: error.message || "Failed to check booking status" });
  }
});

app.get("/bookedSessions/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const query = { user: email };
    const { bookedSessionsCollection } = getCollections();
    const result = await bookedSessionsCollection.find(query).sort({ _id: -1 }).toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching student booked sessions:", error);
    res.status(500).send({ error: error.message || "Failed to fetch student booked sessions" });
  }
});

app.get("/bookedDetails/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { bookedSessionsCollection } = getCollections();
    const query = { _id: new ObjectId(id) };
    const result = await bookedSessionsCollection.findOne(query);
    res.send(result);
  } catch (error) {
    console.error("Error fetching booked details:", error);
    res.status(500).send({ error: error.message || "Failed to fetch booked details" });
  }
});

// ================= Student Reviews & Notes APIs =================
app.post("/all-reviews", async (req, res) => {
  try {
    const review = req.body;
    const { studentReviewCollection } = getCollections();
    const result = await studentReviewCollection.insertOne(review);
    res.send(result);
  } catch (error) {
    console.error("Error submitting review:", error);
    res.status(500).send({ error: error.message || "Failed to submit review" });
  }
});

app.post("/all-notes", async (req, res) => {
  try {
    const note = req.body;
    const { studentNoteCollection } = getCollections();
    const result = await studentNoteCollection.insertOne(note);
    res.send(result);
  } catch (error) {
    console.error("Error creating note:", error);
    res.status(500).send({ error: error.message || "Failed to create note" });
  }
});

app.get("/all-notes/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const query = { email: email };
    const { studentNoteCollection } = getCollections();
    const result = await studentNoteCollection.find(query).toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching notes:", error);
    res.status(500).send({ error: error.message || "Failed to fetch notes" });
  }
});

app.delete("/all-notes/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { studentNoteCollection } = getCollections();
    const query = { _id: new ObjectId(id) };
    const result = await studentNoteCollection.deleteOne(query);
    res.send(result);
  } catch (error) {
    console.error("Error deleting note:", error);
    res.status(500).send({ error: error.message || "Failed to delete note" });
  }
});

app.put("/all-notes/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { _id, ...updatedNote } = req.body;
    const { studentNoteCollection } = getCollections();
    const query = { _id: new ObjectId(id) };
    const update = {
      $set: updatedNote,
    };
    const result = await studentNoteCollection.updateOne(query, update);
    res.send(result);
  } catch (error) {
    console.error("Error updating note:", error);
    res.status(500).send({ error: error.message || "Failed to update note" });
  }
});

// ================= Stripe Payment Intent API =================
app.post("/create-payment-intent", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).send({
        error: "Stripe secret key is not configured on the server. Please set STRIPE_SECRET_KEY in your environment variables.",
      });
    }

    const { registrationFee } = req.body;
    const fee = parseFloat(registrationFee);

    if (isNaN(fee) || fee <= 0) {
      return res.status(400).send({
        error: "Payment intent requires a positive registration fee.",
      });
    }

    const amount = Math.round(fee * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: "usd",
      payment_method_types: ["card"],
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error("Stripe payment intent error:", error);
    res.status(500).send({ error: error.message || "Failed to create payment intent" });
  }
});

if (!process.env.VERCEL) {
  app.listen(port, async () => {
    console.log(`🚀 Collaborative Study Server is listening on port ${port}`);
    try {
      const { client, db } = getDatabase();
      await client.db("admin").command({ ping: 1 });
      const count = await db.collection("users").countDocuments();
      console.log(`✅ Successfully connected to MongoDB Atlas! (Database: collaborative-study, Users: ${count})`);
    } catch (err) {
      console.error(`❌ MongoDB connection error:`, err.message);
    }
  });
}

// Export for Vercel Serverless Functions
module.exports = app;

