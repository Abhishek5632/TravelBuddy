// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient, ObjectId } from "mongodb";
import bodyParser from "body-parser";
import http from "http";
import { Server as IOServer } from "socket.io";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));
app.use(bodyParser.json({ limit: "30mb" }));
app.use(bodyParser.urlencoded({ limit: "30mb", extended: true }));

// Serve static frontend files (public/)
app.use(express.static(path.join(__dirname, "public")));

// HTTP + Socket.io
const server = http.createServer(app);
const io = new IOServer(server, {
  cors: { origin: "*" },
});

// ----------------- MongoDB Connection -----------------
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
let usersCollection;
let chatsCollection;
let blogsCollection;
let photosCollection;

async function connectDB() {
  try {
    await client.connect();
    const db = client.db("travel_bunk");
    usersCollection = db.collection("users");
    chatsCollection = db.collection("chats");
    blogsCollection = db.collection("blogs");
    photosCollection = db.collection("photos");

    console.log("✅ Connected to MongoDB Atlas (travel_bunk)");

    // indexes
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await chatsCollection.createIndex({ users: 1 });
    await blogsCollection.createIndex({ createdAt: -1 });
    await blogsCollection.createIndex({ authorEmail: 1 });
    await photosCollection.createIndex({ createdAt: -1 });
    await photosCollection.createIndex({ authorEmail: 1 });

  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
  }
}
connectDB();

// ----------------- Socket.IO -----------------
io.on("connection", (socket) => {
  socket.on("join", ({ email }) => {
    if (email) socket.join(email);
  });

  socket.on("disconnect", () => {});
});

// ----------------- Aadhaar Verhoeff (same as before) -----------------
function verhoeffCheck(aadhaar) {
  const d = [
    [0,1,2,3,4,5,6,7,8,9],
    [1,2,3,4,0,6,7,8,9,5],
    [2,3,4,0,1,7,8,9,5,6],
    [3,4,0,1,2,8,9,5,6,7],
    [4,0,1,2,3,9,5,6,7,8],
    [5,9,8,7,6,0,4,3,2,1],
    [6,5,9,8,7,1,0,4,3,2],
    [7,6,5,9,8,2,1,0,4,3],
    [8,7,6,5,9,3,2,1,0,4],
    [9,8,7,6,5,4,3,2,1,0]
  ];

  const p = [
    [0,1,2,3,4,5,6,7,8,9],
    [1,5,7,6,2,8,3,0,9,4],
    [5,8,0,3,7,9,6,1,4,2],
    [8,9,1,6,0,4,3,5,2,7],
    [9,4,5,3,1,2,6,8,7,0],
    [4,2,8,6,5,7,3,9,0,1],
    [2,7,9,3,8,0,6,4,1,5],
    [7,0,4,6,9,1,3,2,5,8]
  ];

  let c = 0;
  aadhaar.split('').reverse().forEach((num, i) => {
    c = d[c][p[i % 8][parseInt(num, 10)]];
  });
  return c === 0;
}

// ----------------- AUTH / USERS (signup/login/update) -----------------
app.post("/api/signup", async (req, res) => {
  try {
    const data = req.body;
    if (!data.firstName || !data.email || !data.password) {
      return res.json({ success: false, message: "Missing required fields" });
    }
    if (!/^\d{12}$/.test(data.aadhaar)) {
      return res.json({ success: false, message: "Invalid Aadhaar number format" });
    }
    if (!verhoeffCheck(data.aadhaar)) {
      return res.json({ success: false, message: "Invalid Aadhaar checksum" });
    }

    const existingUser = await usersCollection.findOne({ email: data.email });
    if (existingUser) return res.json({ success: false, message: "Email already exists" });

    const newUser = {
      firstName: data.firstName,
      lastName: data.lastName || "",
      email: data.email,
      phone: data.phone || "",
      age: data.age || "",
      travelStyle: data.travelStyle || "",
      password: data.password,
      aadhaar: data.aadhaar,
      newsletter: data.newsletter || false,
      college: data.college || "",
      trips: data.trips || [],
      blogs: data.blogs || [],
      photos: data.photos || [],
      totalDistance: 0,
      rating: (Math.random() * (5 - 3.8) + 3.8).toFixed(1),
      badges: ["🎒 New Explorer", "🧭 Joined TravelBuddy"],
      bio: data.bio || "Travel enthusiast. Love exploring new cultures!",
      img: data.img || "https://cdn-icons-png.flaticon.com/512/1077/1077114.png",
      requests: [],
      sentRequests: [],
      connections: [],
    };

    await usersCollection.insertOne(newUser);
    console.log("👤 New user registered:", data.email);
    res.json({ success: true, user: newUser });

  } catch (err) {
    console.error("❌ Signup error:", err);
    if (err?.code === 11000) {
      return res.json({ success: false, message: "Email already exists" });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: "Missing fields" });
    const user = await usersCollection.findOne({ email, password });
    if (!user) return res.json({ success: false, message: "Invalid email or password" });
    res.json({ success: true, user });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.json({ success: false, message: "Server error" });
  }
});

app.post("/api/update-profile", async (req, res) => {
  try {
    const { email, ...updates } = req.body;
    if (!email) return res.json({ success: false, message: "Missing email" });
    if (updates._id) delete updates._id;
    const result = await usersCollection.updateOne({ email }, { $set: updates });
    if (result.modifiedCount === 0) return res.json({ success: false, message: "No changes or user not found" });
    const updatedUser = await usersCollection.findOne({ email });
    console.log("✏️ Profile updated:", email);
    res.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error("❌ Update profile error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ----------------- Requests, chats, trips, etc. (kept intact) -----------------
app.post("/api/find-users-by-trip", async (req, res) => {
  const { date, destination } = req.body;
  if (!date || !destination) return res.json({ success: false, message: "Missing date or destination" });
  try {
    const users = await usersCollection
      .find({
        trips: {
          $elemMatch: {
            date,
            destination: { $regex: new RegExp(`^${destination}$`, "i") },
          },
        },
      })
      .toArray();

    const matchedUsers = users.map((u) => ({
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      college: u.college || "",
      img: u.img || "https://cdn-icons-png.flaticon.com/512/1077/1077114.png",
      trips: u.trips.filter(
        (t) =>
          t.date === date &&
          t.destination.toLowerCase() === destination.toLowerCase()
      ),
    }));

    res.json({ success: true, users: matchedUsers });
  } catch (err) {
    console.error("❌ Find-users-by-trip error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/api/send-request", async (req, res) => {
  try {
    const { fromEmail, toEmail } = req.body;
    if (!fromEmail || !toEmail) return res.json({ success: false, message: "Missing fields" });

    const fromUser = await usersCollection.findOne({ email: fromEmail });
    const toUser = await usersCollection.findOne({ email: toEmail });

    if (!fromUser || !toUser) return res.json({ success: false, message: "User(s) not found" });

    // prevent duplicate pending requests
    const pending = (toUser.requests || []).some(
      (r) => r.fromEmail === fromEmail && r.status === "pending"
    );
    if (pending) return res.json({ success: false, message: "Already sent" });

    const requestObj = {
      fromEmail,
      fromName: fromUser.firstName,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    await usersCollection.updateOne(
      { email: toEmail },
      { $push: { requests: requestObj } }
    );

    await usersCollection.updateOne(
      { email: fromEmail },
      { $push: { sentRequests: { toEmail, status: "pending" } } }
    );

    io.to(toEmail).emit("request-received", requestObj);

    res.json({ success: true });
  } catch (err) {
    console.error("❌ send-request error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/requests", async (req, res) => {
  const { email } = req.query;
  try {
    const user = await usersCollection.findOne({ email });
    res.json({
      success: true,
      requests: user.requests || [],
      sentRequests: user.sentRequests || [],
    });
  } catch (err) {
    console.error("❌ /api/requests error:", err);
    res.json({ success: false });
  }
});

app.post("/api/respond-request", async (req, res) => {
  try {
    const { toEmail, fromEmail, action } = req.body;

    if (action !== "accept" && action !== "reject") return res.json({ success: false });

    await usersCollection.updateOne(
      { email: toEmail, "requests.fromEmail": fromEmail },
      { $set: { "requests.$.status": action } }
    );

    await usersCollection.updateOne(
      { email: fromEmail, "sentRequests.toEmail": toEmail },
      { $set: { "sentRequests.$.status": action } }
    );

    if (action === "accept") {
      await usersCollection.updateOne(
        { email: toEmail },
        { $addToSet: { connections: fromEmail } }
      );
      await usersCollection.updateOne(
        { email: fromEmail },
        { $addToSet: { connections: toEmail } }
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ /api/respond-request error:", err);
    res.json({ success: false });
  }
});

// ----------------- Chats -----------------
app.get("/api/get-chat", async (req, res) => {
  try {
    const { user1, user2 } = req.query;
    const usersPair = [user1, user2].sort();
    const chat = await chatsCollection.findOne({ users: usersPair });
    res.json({
      success: true,
      messages: chat ? chat.messages : [],
      chatId: chat ? chat._id : null,
    });
  } catch (err) {
    console.error("❌ /api/get-chat error:", err);
    res.json({ success: false });
  }
});

app.post("/api/send-message", async (req, res) => {
  try {
    const { from, to, text } = req.body;
    if (!from || !to || !text) return res.json({ success: false, message: "Missing fields" });

    const usersPair = [from, to].sort();
    const msg = {
      sender: from,
      text,
      time: new Date().toISOString(),
    };

    await chatsCollection.updateOne(
      { users: usersPair },
      {
        $push: { messages: msg },
        $setOnInsert: {
          users: usersPair,
          createdAt: new Date().toISOString(),
        },
      },
      { upsert: true }
    );

    io.to(from).emit("new-message", msg);
    io.to(to).emit("new-message", msg);

    res.json({ success: true });
  } catch (err) {
    console.error("❌ /api/send-message error:", err);
    res.json({ success: false });
  }
});

// ----------------- User profile / utilities -----------------
app.get("/api/user-profile", async (req, res) => {
  try {
    const email = req.query.email;
    const user = await usersCollection.findOne({ email });
    if (!user) return res.json({ success: false, message: "Not found" });
    res.json({ success: true, user });
  } catch (err) {
    console.error("❌ /api/user-profile error:", err);
    res.json({ success: false });
  }
});

app.get("/api/get-all-users", async (req, res) => {
  try {
    const users = await usersCollection.find().toArray();
    res.json({ success: true, users });
  } catch (err) {
    console.error("❌ /api/get-all-users error:", err);
    res.json({ success: false });
  }
});

app.get("/api/user-trips/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, trips: user.trips || [] });
  } catch (err) {
    console.error("❌ /api/user-trips error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/blogs/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, blogs: user.blogs || [] });
  } catch (err) {
    console.error("❌ /api/user-blogs error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ----------------- BLOGS (global) -----------------
/*
POST /api/add-blog
body: { title, content, image (array or string), video (array or string), author, authorEmail, destination }
*/
app.post("/api/add-blog", async (req, res) => {
  try {
    const { title, content, image, video, author, authorEmail, destination } = req.body;
    if (!title || !content) return res.json({ success: false, message: "Missing title or content" });

    const blogDoc = {
      title,
      content,
      image: image || [],
      video: video || [],
      author: author || "Anonymous",
      authorEmail: authorEmail || null,
      destination: destination || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const insertRes = await blogsCollection.insertOne(blogDoc);
    blogDoc._id = insertRes.insertedId;

    // push to user's profile summary if authorEmail is present
    if (authorEmail) {
      await usersCollection.updateOne(
        { email: authorEmail },
        {
          $push: {
            blogs: {
              id: blogDoc._id,
              title: blogDoc.title,
              content: blogDoc.content,
              image: Array.isArray(blogDoc.image) ? blogDoc.image[0] || "" : blogDoc.image,
              date: blogDoc.createdAt,
              destination: blogDoc.destination || ""
            }
          }
        }
      );
    }

    // emit to all clients
    io.emit("new-blog", blogDoc);

    res.json({ success: true, blog: blogDoc });
  } catch (err) {
    console.error("❌ /api/add-blog error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/all-blogs", async (req, res) => {
  try {
    const blogs = await blogsCollection.find().sort({ createdAt: -1 }).toArray();
    res.json({ success: true, blogs });
  } catch (err) {
    console.error("❌ /api/all-blogs error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/blog/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const blog = await blogsCollection.findOne({ _id: new ObjectId(id) });
    if (!blog) return res.status(404).json({ success: false, message: "Blog not found" });
    res.json({ success: true, blog });
  } catch (err) {
    console.error("❌ /api/blog/:id error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ----------------- PHOTOS (global) -----------------
/*
POST /api/add-photo
body: { image, author, authorEmail }
*/
app.post("/api/add-photo", async (req, res) => {
  try {
    const { image, author, authorEmail } = req.body;
    if (!image || !authorEmail) return res.json({ success: false, message: "Missing fields" });

    const photoDoc = {
      image,
      author: author || "Unknown",
      authorEmail,
      createdAt: new Date().toISOString(),
    };

    const insertRes = await photosCollection.insertOne(photoDoc);
    photoDoc._id = insertRes.insertedId;

    // add to user's profile
    await usersCollection.updateOne(
      { email: authorEmail },
      { $push: { photos: { id: photoDoc._id, image: photoDoc.image, date: photoDoc.createdAt } } }
    );

    io.emit("new-photo", photoDoc);
    res.json({ success: true, photo: photoDoc });
  } catch (err) {
    console.error("❌ /api/add-photo error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/all-photos", async (req, res) => {
  try {
    const photos = await photosCollection.find().sort({ createdAt: -1 }).toArray();
    res.json({ success: true, photos });
  } catch (err) {
    console.error("❌ /api/all-photos error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ----------------- PING -----------------
app.get("/api/ping", (req, res) => res.json({ success: true }));

// ----------------- Page routes (static) -----------------
const pages = [
  "index",
  "find-companion",
  "explore-trips",
  "profile",
  "about",
  "contact",
  "blog",
  "signin",
  "signup",
  "chatbot",
  "trips",
  "companion-profile",
  "chat"
];

pages.forEach((page) =>
  app.get(`/${page === "index" ? "" : page}`, (req, res) =>
    res.sendFile(path.join(__dirname, "public", `${page}.html`))
  )
);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ----------------- START SERVER -----------------
const PORT = process.env.PORT || 5001;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on PORT ${PORT}`);
});
