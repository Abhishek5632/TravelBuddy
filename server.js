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
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";


dotenv.config();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM;

if (RESEND_API_KEY && RESEND_FROM) {
  console.log("✅ Resend email service configured.");
} else {
  console.log("⚠️ Resend email service not configured.");
}

async function sendLoginOtpEmail(to, otp) {
  if (!RESEND_API_KEY || !RESEND_FROM) {
    throw new Error("Resend email service is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [to],
      subject: "TravelBuddy Login OTP",
      text: `Your TravelBuddy login OTP is ${otp}. It expires in 5 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto;">
          <h2>TravelBuddy Login OTP 🔐</h2>
          <p>Your login OTP is:</p>
          <h1 style="letter-spacing: 6px;">${otp}</h1>
          <p>This OTP expires in <strong>5 minutes</strong>.</p>
          <p>If you did not try to log in, you can safely ignore this email.</p>
        </div>
      `
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("❌ Resend email error:", data);
    throw new Error(data?.message || "Failed to send OTP email.");
  }

  console.log("📧 Login OTP email sent to:", to);

  return data;
}

if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET is missing from .env. Authentication cannot start safely.");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const JWT_SECRET = process.env.JWT_SECRET;
const app = express();


// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors());

app.use(express.json({
  limit: "30mb"
}));

app.use(express.urlencoded({
  limit: "30mb",
  extended: true
}));

app.use(bodyParser.json({
  limit: "30mb"
}));

app.use(bodyParser.urlencoded({
  limit: "30mb",
  extended: true
}));

app.use(express.static(
  path.join(__dirname, "public")
));


// =====================================================
// HTTP SERVER + SOCKET.IO
// =====================================================

const server = http.createServer(app);

const io = new IOServer(server, {
  cors: {
    origin: "*"
  }
});


// =====================================================
// MONGODB
// =====================================================

const uri = process.env.MONGO_URI;

if (!uri) {
  console.error("❌ MONGO_URI is missing from .env file");
}

const client = new MongoClient(uri);

let usersCollection;
let chatsCollection;
let blogsCollection;
let photosCollection;
let otpChallengesCollection;
let safetyReportsCollection;
let blockedUsersCollection;
let sessionsCollection;


// =====================================================
// DATABASE CONNECTION
// =====================================================

async function connectDB() {

  try {

    await client.connect();

    const db = client.db("travel_bunk");

    usersCollection = db.collection("users");
    chatsCollection = db.collection("chats");
    blogsCollection = db.collection("blogs");
    photosCollection = db.collection("photos");
    otpChallengesCollection = db.collection("otpChallenges");
    safetyReportsCollection = db.collection("safetyReports");
    blockedUsersCollection = db.collection("blockedUsers");
    sessionsCollection = db.collection("sessions");

    console.log(
      "✅ Connected to MongoDB Atlas (travel_bunk)"
    );


    await usersCollection.createIndex(
      { email: 1 },
      { unique: true }
    );

    await chatsCollection.createIndex({
      users: 1
    });

    await blogsCollection.createIndex({
      createdAt: -1
    });

    await blogsCollection.createIndex({
      authorEmail: 1
    });

    await photosCollection.createIndex({
      createdAt: -1
    });

    await photosCollection.createIndex({
      authorEmail: 1
    });

    await otpChallengesCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await sessionsCollection.createIndex({ sessionId: 1 }, { unique: true });
    await sessionsCollection.createIndex({ userId: 1 });
    await blockedUsersCollection.createIndex({ ownerId: 1, blockedId: 1 }, { unique: true });
    await safetyReportsCollection.createIndex({ createdAt: -1 });


  } catch (err) {

    console.error(
      "❌ MongoDB connection failed:",
      err
    );

  }

}

connectDB();


// =====================================================
// SOCKET.IO
// =====================================================

io.on("connection", (socket) => {

  socket.on("join", ({ email }) => {

    if (email) {
      socket.join(email);
    }

  });

});


// =====================================================
// VERHOEFF ALGORITHM
// =====================================================

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


  aadhaar
    .split("")
    .reverse()
    .forEach((num, i) => {

      c =
        d[c][
          p[i % 8][
            parseInt(num, 10)
          ]
        ];

    });


  return c === 0;

}


// =====================================================
// SIGNUP
// =====================================================

app.post("/api/signup", async (req, res) => {

  try {

    if (!usersCollection) {

      return res.status(503).json({

        success: false,

        message:
          "Database is still connecting. Please try again."

      });

    }


    const {

      firstName,
      lastName,
      email,
      phone,
      college,
      age,
      travelStyle,
      password,
      aadhaar,
      gender,
      emergencyContact,
      newsletter

    } = req.body;


    // =================================================
    // REQUIRED FIELDS
    // =================================================

    if (
      !firstName ||
      !email ||
      !password ||
      !gender ||
      !emergencyContact?.name ||
      !emergencyContact?.phone
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Please fill all required fields."

      });

    }


    // =================================================
    // EMAIL
    // =================================================

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


    if (!emailRegex.test(email)) {

      return res.status(400).json({

        success: false,

        message:
          "Please enter a valid email."

      });

    }


    // =================================================
    // PASSWORD
    // =================================================

    if (password.length < 8) {

      return res.status(400).json({

        success: false,

        message:
          "Password must contain at least 8 characters."

      });

    }


    // =================================================
    // PHONE
    // =================================================

    if (!/^\d{10}$/.test(phone)) {

      return res.status(400).json({

        success: false,

        message:
          "Phone number must contain 10 digits."

      });

    }


    // =================================================
    // EMERGENCY PHONE
    // =================================================

    if (
      !/^\d{10}$/.test(
        emergencyContact.phone
      )
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Emergency contact number must contain 10 digits."

      });

    }


    // =================================================
    // AADHAAR
    // =================================================

    if (aadhaar) {

      if (
        !/^\d{12}$/.test(aadhaar) ||
        !verhoeffCheck(aadhaar)
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Invalid Aadhaar number."

        });

      }

    }


    // =================================================
    // CHECK EXISTING USER
    // =================================================

    // IMPORTANT:
    // DO NOT USE db.collection() HERE.
    // `db` exists only inside connectDB().
    // Use the already initialized usersCollection.

    const existingUser =
      await usersCollection.findOne({

        email:
          email
            .toLowerCase()
            .trim()

      });


    if (existingUser) {

      return res.status(409).json({

        success: false,

        message:
          "An account with this email already exists."

      });

    }


    // =================================================
    // HASH PASSWORD
    // =================================================

    const hashedPassword =
      await bcrypt.hash(
        password,
        12
      );


    // =================================================
    // CREATE USER
    // =================================================

    const newUser = {

      firstName:
        firstName.trim(),

      lastName:
        lastName?.trim() || "",


      email:
        email
          .toLowerCase()
          .trim(),


      phone:
        phone,


      college:
        college || "",


      age:
        age || "",


      travelStyle:
        travelStyle || "",


      // NEVER STORE PLAIN PASSWORD
      password:
        hashedPassword,


      // =================================================
      // SAFETY INFORMATION
      // =================================================

      gender:
        gender,


      emergencyContact: {

        name:
          emergencyContact.name.trim(),

        phone:
          emergencyContact.phone,

        verified:
          false

      },


      // =================================================
      // VERIFICATION
      // =================================================

      verification: {

        email:
          false,

        phone:
          false,

        identity:
          false,

        selfie:
          false

      },


      // Aadhaar checksum validation only
      aadhaarVerified:
        Boolean(aadhaar),


      newsletter:
        Boolean(newsletter),


      // =================================================
      // PROFILE
      // =================================================

      trips: [],

      blogs: [],

      photos: [],

      totalDistance:
        0,

      rating:
        Number(
          (4 + Math.random()).toFixed(1)
        ),

      badges: [],

      bio:
        "",

      img:
        req.body.img || "",

      requests: [],

      sentRequests: [],

      connections: [],

      createdAt:
        new Date()

    };


    // =================================================
    // DEBUG LOG
    // =================================================

    console.log(
      "🛡️ Signup safety data:",
      {
        email:
          newUser.email,

        gender:
          newUser.gender,

        emergencyContact:
          newUser.emergencyContact,

        passwordHashed:
          newUser.password.startsWith("$2")

      }
    );


    // =================================================
    // INSERT USER
    // =================================================

    const result =
      await usersCollection.insertOne(
        newUser
      );


    // =================================================
    // RESPONSE
    // =================================================

    return res.status(201).json({

      success: true,

      message:
        "Account created successfully.",

      user: {

        id:
          result.insertedId,

        firstName:
          newUser.firstName,

        lastName:
          newUser.lastName,

        email:
          newUser.email,

        phone:
          newUser.phone,

        college:
          newUser.college,

        gender:
          newUser.gender,

        img:
          newUser.img,

        verification:
          newUser.verification

      }

    });


  } catch (error) {

    console.error(
      "❌ Signup error:",
      error
    );


    if (error?.code === 11000) {

      return res.status(409).json({

        success: false,

        message:
          "An account with this email already exists."

      });

    }


    return res.status(500).json({

      success: false,

      message:
        "Server error during signup."

    });

  }

});


// =====================================================
// LOGIN
// =====================================================
app.post("/api/login", async (req, res) => {
    try {

        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        if (!JWT_SECRET) {
            console.error("❌ JWT_SECRET is missing");

            return res.status(500).json({
                success: false,
                message: "Server authentication configuration error."
            });
        }

        // Find user
        const user = await usersCollection.findOne({
            email: email.toLowerCase().trim()
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const sessionId = crypto.randomUUID();

        await sessionsCollection.insertOne({
            sessionId,
            userId: user._id.toString(),
            email: user.email,
            createdAt: new Date(),
            lastSeenAt: new Date(),
            revoked: false
        });

    // Create JWT only after password verification.
        if (process.env.REQUIRE_LOGIN_OTP === "true") {
            const otp = crypto.randomInt(100000, 1000000).toString();
            const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
            const challengeId = crypto.randomUUID();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

            await otpChallengesCollection.deleteMany({ userId: user._id.toString(), purpose: "login" });
            await otpChallengesCollection.insertOne({
                challengeId,
                userId: user._id.toString(),
                email: user.email,
                purpose: "login",
                sessionId,
                otpHash,
                attempts: 0,
                createdAt: new Date(),
                expiresAt
            });

            try {
                await sendLoginOtpEmail(user.email, otp);
            } catch (emailError) {
                console.error("❌ OTP email delivery failed:", emailError.message);

                await sessionsCollection.deleteOne({ sessionId });
                await otpChallengesCollection.deleteOne({ challengeId });

                return res.status(500).json({
                    success: false,
                    message: "Unable to send login OTP. Please try again later."
                });
            }

            return res.json({
                success: true,
                requiresOtp: true,
                challengeId,
                message: "OTP sent to your email."
            });
        }

        const token = jwt.sign(
            { userId: user._id.toString(), email: user.email, sessionId },
            JWT_SECRET,
            { expiresIn: "7d" }
        );

        console.log("🔐 JWT created for:", user.email);

        return res.json({
            success: true,
            message: "Login successful.",

            token: token,

            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                college: user.college,
                gender: user.gender,
                img: user.img,

                verification: user.verification || {
                    email: false,
                    phone: false,
                    identity: false,
                    selfie: false
                }
            }
        });

    } catch (error) {

        console.error("❌ Login error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error during login."
        });
    }
});
app.post("/api/verify-login-otp", async (req, res) => {
  try {
    const { challengeId, otp } = req.body;

    if (!challengeId || !otp) {
      return res.status(400).json({
        success: false,
        message: "Challenge ID and OTP are required."
      });
    }

    if (!/^\d{6}$/.test(String(otp))) {
      return res.status(400).json({
        success: false,
        message: "OTP must contain 6 digits."
      });
    }

    const challenge = await otpChallengesCollection.findOne({
      challengeId,
      purpose: "login"
    });

    if (!challenge) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP."
      });
    }

    if (new Date() > new Date(challenge.expiresAt)) {
      await otpChallengesCollection.deleteOne({ challengeId });

      if (challenge.sessionId) {
        await sessionsCollection.updateOne(
          { sessionId: challenge.sessionId },
          { $set: { revoked: true, revokedAt: new Date() } }
        );
      }

      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please login again."
      });
    }

    if (challenge.attempts >= 5) {
      await otpChallengesCollection.deleteOne({ challengeId });

      if (challenge.sessionId) {
        await sessionsCollection.updateOne(
          { sessionId: challenge.sessionId },
          { $set: { revoked: true, revokedAt: new Date() } }
        );
      }

      return res.status(429).json({
        success: false,
        message: "Too many incorrect OTP attempts. Please login again."
      });
    }

    const otpHash = crypto
      .createHash("sha256")
      .update(String(otp))
      .digest("hex");

    if (otpHash !== challenge.otpHash) {
      await otpChallengesCollection.updateOne(
        { challengeId },
        { $inc: { attempts: 1 } }
      );

      return res.status(401).json({
        success: false,
        message: "Invalid OTP."
      });
    }

    const session = await sessionsCollection.findOne({
      sessionId: challenge.sessionId,
      userId: challenge.userId,
      revoked: false
    });

    if (!session) {
      await otpChallengesCollection.deleteOne({ challengeId });

      return res.status(401).json({
        success: false,
        message: "Login session is no longer valid."
      });
    }

    const user = await usersCollection.findOne({
      _id: new ObjectId(challenge.userId)
    });

    if (!user) {
      await otpChallengesCollection.deleteOne({ challengeId });

      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    await otpChallengesCollection.deleteOne({
      challengeId
    });

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        email: user.email,
        sessionId: challenge.sessionId
      },
      JWT_SECRET,
      {
        expiresIn: "7d"
      }
    );

    console.log("🔐 OTP verified. JWT created for:", user.email);

    return res.json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        college: user.college,
        gender: user.gender,
        img: user.img,
        verification: user.verification || {
          email: false,
          phone: false,
          identity: false,
          selfie: false
        }
      }
    });

  } catch (error) {
    console.error("❌ OTP verification error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error during OTP verification."
    });
  }
});

// =====================================================
// UPDATE PROFILE
// =====================================================
// =====================================================
// JWT AUTHENTICATION MIDDLEWARE
// =====================================================

function authenticateToken(req, res, next) {

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {

    return res.status(401).json({
      success: false,
      message: "Authentication required."
    });

  }

  const token = authHeader.split(" ")[1];

  if (!token) {

    return res.status(401).json({
      success: false,
      message: "Authentication token missing."
    });

  }

  try {

    const decoded = jwt.verify(
      token,
      JWT_SECRET
    );

    if (!decoded.userId || !decoded.sessionId) {

      return res.status(403).json({
        success: false,
        message: "Invalid authentication token."
      });

    }

    sessionsCollection.findOneAndUpdate(
      {
        sessionId: decoded.sessionId,
        userId: decoded.userId,
        revoked: false
      },
      {
        $set: {
          lastSeenAt: new Date()
        }
      }
    ).then(session => {

      if (!session) {

        return res.status(403).json({
          success: false,
          message: "Session expired or revoked."
        });

      }

      req.user = decoded;

      next();

    }).catch(err => {

      console.error(
        "❌ Session verification failed:",
        err
      );

      return res.status(500).json({
        success: false,
        message: "Authentication service error."
      });

    });

  } catch (error) {

    console.error(
      "❌ JWT verification failed:",
      error.message
    );

    return res.status(403).json({
      success: false,
      message: "Invalid or expired authentication token."
    });

  }

}
// =====================================================
// JWT AUTH CHECK
// =====================================================

app.get(
  "/api/auth-check",
  authenticateToken,
  async (req, res) => {

    try {

      const user = await usersCollection.findOne({
        _id: new ObjectId(req.user.userId)
      });

      if (!user) {

        return res.status(404).json({
          success: false,
          message: "User not found."
        });

      }

      return res.json({

        success: true,

        message: "JWT authentication verified.",

        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email
        }

      });

    } catch (error) {

      console.error(
        "❌ Auth check error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Authentication check failed."
      });

    }

  }
);

app.post(
  "/api/update-profile",
  authenticateToken,
  async (req, res) => {
    try {
      const updates = { ...req.body };

      delete updates._id;
      delete updates.email;
      delete updates.password;
      delete updates.aadhaar;
      delete updates.aadhaarVerified;
      delete updates.verificationStatus;
      delete updates.verificationMethod;
      delete updates.verificationDate;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid profile fields to update."
        });
      }

      const result = await usersCollection.updateOne(
        {
          _id: new ObjectId(req.user.userId)
        },
        {
          $set: {
            ...updates,
            updatedAt: new Date()
          }
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found."
        });
      }

      const updatedUser = await usersCollection.findOne(
        {
          _id: new ObjectId(req.user.userId)
        },
        {
          projection: {
            password: 0,
            aadhaar: 0
          }
        }
      );

      return res.json({
        success: true,
        message: "Profile updated successfully.",
        user: updatedUser
      });

    } catch (error) {
      console.error("❌ Update profile error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update profile."
      });
    }
  }
);

// =====================================================
// FIND USERS BY TRIP
// =====================================================

app.post(
  "/api/find-users-by-trip",
  async (req, res) => {

    const {
      date,
      destination
    } = req.body;


    if (
      !date ||
      !destination
    ) {

      return res.json({

        success: false,

        message:
          "Missing date or destination"

      });

    }


    try {

      const users =
        await usersCollection

          .find({

            trips: {

              $elemMatch: {

                date,

                destination: {

                  $regex:
                    new RegExp(
                      `^${destination}$`,
                      "i"
                    )

                }

              }

            }

          })

          .toArray();


      const matchedUsers =
        users.map((u) => ({

          firstName:
            u.firstName,

          lastName:
            u.lastName,

          email:
            u.email,

          college:
            u.college || "",

          img:
            u.img ||
            "https://cdn-icons-png.flaticon.com/512/1077/1077114.png",

          trips:
            (u.trips || []).filter(

              (t) =>

                t.date === date &&

                t.destination
                  .toLowerCase() ===
                destination
                  .toLowerCase()

            )

        }));


      res.json({

        success: true,

        users:
          matchedUsers

      });


    } catch (err) {

      console.error(
        "❌ Find-users-by-trip error:",
        err
      );


      res.status(500).json({

        success: false,

        message:
          "Server error"

      });

    }

  }
);


// =====================================================
// LOGOUT
// =====================================================

app.get(
  "/api/logout",
  (req, res) => {

    res.json({

      success: true,

      message:
        "Logged out successfully"

    });

  }
);


// =====================================================
// SECURITY: SESSION LOGOUT / LOGOUT ALL
// =====================================================

app.post("/api/logout", authenticateToken, async (req, res) => {
  try {
    await sessionsCollection.updateOne(
      { sessionId: req.user.sessionId },
      { $set: { revoked: true, revokedAt: new Date() } }
    );
    return res.json({ success: true, message: "Logged out successfully." });
  } catch (error) {
    console.error("❌ Logout error:", error);
    return res.status(500).json({ success: false, message: "Logout failed." });
  }
});

app.post("/api/logout-all-sessions", authenticateToken, async (req, res) => {
  try {
    await sessionsCollection.updateMany(
      { userId: req.user.userId, revoked: false },
      { $set: { revoked: true, revokedAt: new Date() } }
    );
    return res.json({ success: true, message: "All sessions logged out." });
  } catch (error) {
    console.error("❌ Logout-all error:", error);
    return res.status(500).json({ success: false, message: "Logout-all failed." });
  }
});

// =====================================================
// ADD TRIP
// =====================================================

app.post(
  "/api/add-trip",
  authenticateToken,
  async (req, res) => {

    try {

      const {
        destination,
        date,
        budget,
        notes
      } = req.body;

      const authenticatedEmail = req.user.email;

      if (
        !authenticatedEmail ||
        !destination ||
        !date
      ) {

        return res.json({
          success: false,
          message: "Missing fields"
        });

      }

      const trip = {

        destination,

        date,

        budget:
          budget || "",

        notes:
          notes || "",

        createdAt:
          new Date().toISOString()

      };


      await usersCollection.updateOne(

        {
          email: authenticatedEmail
        },

        {

          $push: {

            trips:
              trip

          }

        }

      );


      res.json({

        success: true,

        trip

      });


    } catch (err) {

      console.error(
        "❌ /api/add-trip error:",
        err
      );


      res.status(500).json({

        success: false,

        message:
          "Server error"

      });

    }

  }
);

// =====================================================
// SEND REQUEST
// =====================================================
app.post(
  "/api/send-request",
  authenticateToken,
  async (req, res) => {

    try {

      const fromEmail =
        String(req.user.email || "")
          .trim()
          .toLowerCase();

      const normalizedToEmail =
        String(req.body.toEmail || "")
          .trim()
          .toLowerCase();

      if (!fromEmail || !normalizedToEmail) {
        return res.status(400).json({
          success: false,
          message: "Recipient email is required."
        });
      }

      if (fromEmail === normalizedToEmail) {
        return res.status(400).json({
          success: false,
          message: "You cannot send a request to yourself."
        });
      }

      const fromUser = await usersCollection.findOne({
        email: fromEmail
      });

      const targetUser = await usersCollection.findOne({
        email: normalizedToEmail
      });

      if (!fromUser || !targetUser) {
        return res.status(404).json({
          success: false,
          message: "User not found."
        });
      }

      const alreadyConnected =
        (fromUser.connections || []).some(
          email =>
            String(email).trim().toLowerCase() ===
            normalizedToEmail
        ) ||
        (targetUser.connections || []).some(
          email =>
            String(email).trim().toLowerCase() ===
            fromEmail
        );

      if (alreadyConnected) {
        return res.status(400).json({
          success: false,
          message: "You are already connected."
        });
      }

      const pendingOutgoing =
        (fromUser.sentRequests || []).some(
          request =>
            String(request.toEmail || "")
              .trim()
              .toLowerCase() === normalizedToEmail &&
            request.status === "pending"
        );

      const pendingIncoming =
        (targetUser.requests || []).some(
          request =>
            String(request.fromEmail || "")
              .trim()
              .toLowerCase() === fromEmail &&
            request.status === "pending"
        );

      if (pendingOutgoing || pendingIncoming) {
        return res.status(409).json({
          success: false,
          message: "Connection request already pending."
        });
      }

      const requestObj = {
        fromEmail,
        fromName: fromUser.firstName,
        status: "pending",
        createdAt: new Date().toISOString()
      };

      await usersCollection.updateOne(
        {
          email: normalizedToEmail
        },
        {
          $push: {
            requests: requestObj
          }
        }
      );

      await usersCollection.updateOne(
        {
          email: fromEmail
        },
        {
          $push: {
            sentRequests: {
              toEmail: normalizedToEmail,
              status: "pending",
              createdAt: new Date().toISOString()
            }
          }
        }
      );

      io.to(normalizedToEmail).emit(
        "request-received",
        requestObj
      );

      return res.json({
        success: true,
        message: "Connection request sent."
      });

    } catch (err) {

      console.error(
        "❌ /api/send-request error:",
        err
      );

      return res.status(500).json({
        success: false,
        message: "Failed to send connection request."
      });

    }

  }
);

// =====================================================
// GET REQUESTS
// =====================================================

app.get(
  "/api/requests",
  authenticateToken,
  async (req, res) => {
    try {
      const email = req.user.email;

      const user = await usersCollection.findOne(
        { email },
        {
          projection: {
            requests: 1,
            sentRequests: 1
          }
        }
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          requests: [],
          sentRequests: []
        });
      }

      return res.json({
        success: true,
        requests: user.requests || [],
        sentRequests: user.sentRequests || []
      });

    } catch (err) {
      console.error("❌ /api/requests error:", err);

      return res.status(500).json({
        success: false,
        message: "Server error"
      });
    }
  }
);


// =====================================================
// RESPOND REQUEST
// =====================================================

app.post(
  "/api/respond-request",
  authenticateToken,
  async (req, res) => {
    try {
      const { fromEmail, action } = req.body;
      const toEmail = req.user.email;

      if (!fromEmail || !action) {
        return res.status(400).json({
          success: false,
          message: "Missing fields"
        });
      }

      const normalizedFromEmail = fromEmail.toLowerCase().trim();

      if (!["accept", "reject"].includes(action)) {
        return res.status(400).json({
          success: false,
          message: "Invalid action."
        });
      }

      const requestOwner = await usersCollection.findOne({
        email: toEmail,
        "requests.fromEmail": normalizedFromEmail
      });

      if (!requestOwner) {
        return res.status(404).json({
          success: false,
          message: "Request not found."
        });
      }

      if (action === "accept") {
        await usersCollection.updateOne(
          {
            email: toEmail,
            "requests.fromEmail": normalizedFromEmail
          },
          {
            $set: {
              "requests.$.status": "accepted"
            },
            $addToSet: {
              connections: normalizedFromEmail
            }
          }
        );

        await usersCollection.updateOne(
          {
            email: normalizedFromEmail,
            "sentRequests.toEmail": toEmail
          },
          {
            $set: {
              "sentRequests.$.status": "accepted"
            },
            $addToSet: {
              connections: toEmail
            }
          }
        );

      } else {
        await usersCollection.updateOne(
          {
            email: toEmail
          },
          {
            $pull: {
              requests: {
                fromEmail: normalizedFromEmail
              }
            }
          }
        );

        await usersCollection.updateOne(
          {
            email: normalizedFromEmail
          },
          {
            $pull: {
              sentRequests: {
                toEmail: toEmail
              }
            }
          }
        );
      }

      return res.json({
        success: true,
        message:
          action === "accept"
            ? "Request accepted."
            : "Request rejected."
      });

    } catch (err) {
      console.error("❌ /api/respond-request error:", err);

      return res.status(500).json({
        success: false,
        message: "Server error"
      });
    }
  }
);

// =====================================================
// CHAT
// =====================================================

app.get(
  "/api/get-chat",
  authenticateToken,
  async (req, res) => {

    try {

      const currentUserEmail =
        String(req.user.email || "")
          .trim()
          .toLowerCase();

      const requestedUser1 =
        String(req.query.user1 || "")
          .trim()
          .toLowerCase();

      const requestedUser2 =
        String(req.query.user2 || "")
          .trim()
          .toLowerCase();

      if (!requestedUser1 || !requestedUser2) {
        return res.status(400).json({
          success: false,
          message: "Both chat users are required."
        });
      }

      if (requestedUser1 === requestedUser2) {
        return res.status(400).json({
          success: false,
          message: "Invalid chat participants."
        });
      }

      if (
        requestedUser1 !== currentUserEmail &&
        requestedUser2 !== currentUserEmail
      ) {
        return res.status(403).json({
          success: false,
          message: "You are not a participant in this chat."
        });
      }

      const otherUserEmail =
        requestedUser1 === currentUserEmail
          ? requestedUser2
          : requestedUser1;

      const currentUser = await usersCollection.findOne(
        {
          email: currentUserEmail
        },
        {
          projection: {
            email: 1,
            connections: 1
          }
        }
      );

      const otherUser = await usersCollection.findOne(
        {
          email: otherUserEmail
        },
        {
          projection: {
            email: 1,
            connections: 1
          }
        }
      );

      if (!currentUser || !otherUser) {
        return res.status(404).json({
          success: false,
          message: "Chat user not found."
        });
      }

      const isConnected =
        Array.isArray(currentUser.connections) &&
        currentUser.connections.some(
          email =>
            String(email)
              .trim()
              .toLowerCase() === otherUserEmail
        );

      if (!isConnected) {
        return res.status(403).json({
          success: false,
          message: "You can chat only with connected users."
        });
      }

      const blocked = await blockedUsersCollection.findOne({
        $or: [
          {
            blockerEmail: currentUserEmail,
            blockedEmail: otherUserEmail
          },
          {
            blockerEmail: otherUserEmail,
            blockedEmail: currentUserEmail
          }
        ]
      });

      if (blocked) {
        return res.status(403).json({
          success: false,
          message: "Chat is unavailable because one user has blocked the other."
        });
      }

      const usersPair = [
        currentUserEmail,
        otherUserEmail
      ].sort();

      const chat = await chatsCollection.findOne({
        users: usersPair
      });

      return res.json({
        success: true,
        messages: chat ? chat.messages || [] : [],
        chatId: chat ? chat._id : null
      });

    } catch (err) {

      console.error(
        "❌ /api/get-chat error:",
        err
      );

      return res.status(500).json({
        success: false,
        message: "Failed to load chat."
      });

    }

  }
);


app.post(
  "/api/send-message",
  authenticateToken,
  async (req, res) => {

    try {

      const from =
        String(req.user.email || "")
          .trim()
          .toLowerCase();

      const to =
        String(req.body.to || "")
          .trim()
          .toLowerCase();

      const messageText =
        String(req.body.text || "")
          .trim();

      if (!from || !to || !messageText) {

        return res.status(400).json({
          success: false,
          message: "Recipient and message are required."
        });

      }

      if (from === to) {

        return res.status(400).json({
          success: false,
          message: "You cannot send a message to yourself."
        });

      }

      if (messageText.length > 2000) {

        return res.status(400).json({
          success: false,
          message: "Message is too long."
        });

      }

      const currentUser =
        await usersCollection.findOne(
          {
            email: from
          },
          {
            projection: {
              email: 1,
              connections: 1
            }
          }
        );

      const targetUser =
        await usersCollection.findOne(
          {
            email: to
          },
          {
            projection: {
              email: 1
            }
          }
        );

      if (!currentUser || !targetUser) {

        return res.status(404).json({
          success: false,
          message: "User not found."
        });

      }

      const isConnected =
        Array.isArray(currentUser.connections) &&
        currentUser.connections.includes(to);

      if (!isConnected) {

        return res.status(403).json({
          success: false,
          message: "You can message only connected users."
        });

      }

      const blocked =
        await blockedUsersCollection.findOne({
          $or: [
            {
              blockerEmail: from,
              blockedEmail: to
            },
            {
              blockerEmail: to,
              blockedEmail: from
            }
          ]
        });

      if (blocked) {

        return res.status(403).json({
          success: false,
          message:
            "Message cannot be sent because one user has blocked the other."
        });

      }

      const usersPair = [
        from,
        to
      ].sort();

      const msg = {
        sender: from,
        text: messageText,
        time: new Date().toISOString()
      };

      await chatsCollection.updateOne(
        {
          users: usersPair
        },
        {
          $push: {
            messages: msg
          },
          $setOnInsert: {
            users: usersPair,
            createdAt: new Date().toISOString()
          }
        },
        {
          upsert: true
        }
      );

      io.to(from).emit(
        "new-message",
        msg
      );

      io.to(to).emit(
        "new-message",
        msg
      );

      return res.json({
        success: true,
        message: "Message sent successfully."
      });

    } catch (err) {

      console.error(
        "❌ /api/send-message error:",
        err
      );

      return res.status(500).json({
        success: false,
        message: "Failed to send message."
      });

    }

  }
);

// =====================================================
// USER PROFILE
// =====================================================

app.get(
  "/api/user-profile",
  authenticateToken,
  async (req, res) => {

    try {

      const email =
        String(req.query.email || "")
          .trim()
          .toLowerCase();

      if (!email) {

        return res.status(400).json({
          success: false,
          message: "Email is required."
        });

      }

      const user =
        await usersCollection.findOne(
          {
            email
          },
          {
            projection: {
              firstName: 1,
              lastName: 1,
              email: 1,
              college: 1,
              age: 1,
              gender: 1,
              travelStyle: 1,
              bio: 1,
              img: 1,
              rating: 1,
              trips: 1,
              blogs: 1,
              photos: 1,
              verification: 1
            }
          }
        );

      if (!user) {

        return res.status(404).json({
          success: false,
          message: "User not found."
        });

      }

      const score =
        verificationScore(user);

      const safeUser = {

        id: user._id,

        firstName:
          user.firstName || "",

        lastName:
          user.lastName || "",

        email:
          user.email,

        college:
          user.college || "",

        age:
          user.age || "",

        gender:
          user.gender || "",

        travelStyle:
          user.travelStyle || "",

        bio:
          user.bio || "",

        img:
          user.img || "",

        rating:
          user.rating || 0,

        trips:
          user.trips || [],

        blogs:
          user.blogs || [],

        photos:
          user.photos || [],

        safety: {

          score,

          badge:
            badgeForScore(score),

          verification: {

            email:
              Boolean(
                user.verification?.email
              ),

            phone:
              Boolean(
                user.verification?.phone
              ),

            identity:
              Boolean(
                user.verification?.identity
              ),

            selfie:
              Boolean(
                user.verification?.selfie
              )

          }

        }

      };

      return res.json({
        success: true,
        user: safeUser
      });

    } catch (error) {

      console.error(
        "❌ User profile error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Unable to load profile."
      });

    }

  }
);

// =====================================================
// GET ALL USERS
// =====================================================

app.get(
  "/api/get-all-users",
  async (req, res) => {

    try {

      const users =
        await usersCollection
          .find()
          .toArray();


      res.json({

        success: true,

        users

      });


    } catch (err) {

      console.error(
        "❌ /api/get-all-users error:",
        err
      );


      res.json({

        success: false

      });

    }

  }
);


// =====================================================
// USER TRIPS
// =====================================================

app.get(
  "/api/user-trips/:email",
  async (req, res) => {

    try {

      const email =
        req.params.email;


      const user =
        await usersCollection.findOne({
          email
        });


      if (!user) {

        return res.status(404).json({

          success: false,

          message:
            "User not found"

        });

      }


      res.json({

        success: true,

        trips:
          user.trips || []

      });


    } catch (err) {

      console.error(
        "❌ /api/user-trips error:",
        err
      );


      res.status(500).json({

        success: false,

        message:
          "Server error"

      });

    }

  }
);


// =====================================================
// USER BLOGS
// =====================================================

app.get(
  "/api/blogs/:email",
  async (req, res) => {

    try {

      const email =
        req.params.email;


      const user =
        await usersCollection.findOne({
          email
        });


      if (!user) {

        return res.status(404).json({

          success: false,

          message:
            "User not found"

        });

      }


      res.json({

        success: true,

        blogs:
          user.blogs || []

      });


    } catch (err) {

      console.error(
        "❌ /api/user-blogs error:",
        err
      );


      res.status(500).json({

        success: false,

        message:
          "Server error"

      });

    }

  }
);


// =====================================================
// ADD BLOG
// =====================================================

app.post(
  "/api/add-blog",
  async (req, res) => {

    try {

      const {
        title,
        content,
        image,
        video,
        author,
        authorEmail,
        destination
      } = req.body;


      if (
        !title ||
        !content
      ) {

        return res.json({

          success: false,

          message:
            "Missing title or content"

        });

      }


      const blogDoc = {

        title,

        content,

        image:
          image || [],

        video:
          video || [],

        author:
          author || "Anonymous",

        authorEmail:
          authorEmail || null,

        destination:
          destination || "",

        createdAt:
          new Date().toISOString(),

        updatedAt:
          new Date().toISOString()

      };


      const insertRes =
        await blogsCollection.insertOne(
          blogDoc
        );


      blogDoc._id =
        insertRes.insertedId;


      if (authorEmail) {

        await usersCollection.updateOne(

          {
            email:
              authorEmail

          },

          {

            $push: {

              blogs: {

                id:
                  blogDoc._id,

                title:
                  blogDoc.title,

                content:
                  blogDoc.content,

                image:
                  Array.isArray(
                    blogDoc.image
                  )
                    ? blogDoc.image[0] || ""
                    : blogDoc.image,

                date:
                  blogDoc.createdAt,

                destination:
                  blogDoc.destination || ""

              }

            }

          }

        );

      }


      io.emit(
        "new-blog",
        blogDoc
      );


      res.json({

        success: true,

        blog:
          blogDoc

      });


    } catch (err) {

      console.error(
        "❌ /api/add-blog error:",
        err
      );


      res.status(500).json({

        success: false,

        message:
          "Server error"

      });

    }

  }
);


// =====================================================
// ALL BLOGS
// =====================================================

app.get(
  "/api/all-blogs",
  async (req, res) => {

    try {

      const blogs =
        await blogsCollection

          .find()

          .sort({
            createdAt:
              -1
          })

          .toArray();


      res.json({

        success: true,

        blogs

      });


    } catch (err) {

      console.error(
        "❌ /api/all-blogs error:",
        err
      );


      res.status(500).json({

        success: false,

        message:
          "Server error"

      });

    }

  }
);


// =====================================================
// SINGLE BLOG
// =====================================================

app.get(
  "/api/blog/:id",
  async (req, res) => {

    try {

      const id =
        req.params.id;


      const blog =
        await blogsCollection.findOne({

          _id:
            new ObjectId(id)

        });


      if (!blog) {

        return res.status(404).json({

          success: false,

          message:
            "Blog not found"

        });

      }


      res.json({

        success: true,

        blog

      });


    } catch (err) {

      console.error(
        "❌ /api/blog/:id error:",
        err
      );


      res.status(500).json({

        success: false,

        message:
          "Server error"

      });

    }

  }
);


// =====================================================
// ADD PHOTO
// =====================================================

app.post(
  "/api/add-photo",
  async (req, res) => {

    try {

      const {
        image,
        author,
        authorEmail
      } = req.body;


      if (
        !image ||
        !authorEmail
      ) {

        return res.json({

          success: false,

          message:
            "Missing fields"

        });

      }


      const photoDoc = {

        image,

        author:
          author || "Unknown",

        authorEmail,

        createdAt:
          new Date().toISOString()

      };


      const insertRes =
        await photosCollection.insertOne(
          photoDoc
        );


      photoDoc._id =
        insertRes.insertedId;


      await usersCollection.updateOne(

        {
          email:
            authorEmail

        },

        {

          $push: {

            photos: {

              id:
                photoDoc._id,

              image:
                photoDoc.image,

              date:
                photoDoc.createdAt

            }

          }

        }

      );


      io.emit(
        "new-photo",
        photoDoc
      );


      res.json({

        success: true,

        photo:
          photoDoc

      });


    } catch (err) {

      console.error(
        "❌ /api/add-photo error:",
        err
      );


      res.status(500).json({

        success: false,

        message:
          "Server error"

      });

    }

  }
);


// =====================================================
// ALL PHOTOS
// =====================================================

app.get(
  "/api/all-photos",
  async (req, res) => {

    try {

      const photos =
        await photosCollection

          .find()

          .sort({
            createdAt:
              -1
          })

          .toArray();


      res.json({

        success: true,

        photos

      });


    } catch (err) {

      console.error(
        "❌ /api/all-photos error:",
        err
      );


      res.status(500).json({

        success: false,

        message:
          "Server error"

      });

    }

  }
);


// =====================================================
// SAFETY: BLOCK / REPORT / SOS / LIVE TRIP
// =====================================================

app.post("/api/block-user", authenticateToken, async (req, res) => {
  try {
    const blockedEmail = String(req.body.blockedEmail || "").toLowerCase().trim();
    if (!blockedEmail || blockedEmail === req.user.email.toLowerCase()) {
      return res.status(400).json({ success: false, message: "Valid user is required." });
    }
    const target = await usersCollection.findOne({ email: blockedEmail }, { projection: { _id: 1, email: 1 } });
    if (!target) return res.status(404).json({ success: false, message: "User not found." });
    await blockedUsersCollection.updateOne(
      { ownerId: req.user.userId, blockedId: target._id.toString() },
      { $set: { ownerId: req.user.userId, blockedId: target._id.toString(), blockedEmail, createdAt: new Date() } },
      { upsert: true }
    );
    return res.json({ success: true, message: "User blocked." });
  } catch (error) {
    console.error("❌ Block user error:", error);
    return res.status(500).json({ success: false, message: "Could not block user." });
  }
});

app.post("/api/unblock-user", authenticateToken, async (req, res) => {
  try {
    const blockedEmail = String(req.body.blockedEmail || "").toLowerCase().trim();
    const target = await usersCollection.findOne({ email: blockedEmail }, { projection: { _id: 1 } });
    if (!target) return res.status(404).json({ success: false, message: "User not found." });
    await blockedUsersCollection.deleteOne({ ownerId: req.user.userId, blockedId: target._id.toString() });
    return res.json({ success: true, message: "User unblocked." });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not unblock user." });
  }
});

app.get("/api/blocked-users", authenticateToken, async (req, res) => {
  try {
    const blocked = await blockedUsersCollection.find({ ownerId: req.user.userId }).toArray();
    return res.json({ success: true, blockedUsers: blocked });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load blocked users." });
  }
});

app.post("/api/report-user", authenticateToken, async (req, res) => {
  try {
    const reportedEmail = String(req.body.reportedEmail || "").toLowerCase().trim();
    const reason = String(req.body.reason || "").trim();
    if (!reportedEmail || !reason) return res.status(400).json({ success: false, message: "Reported user and reason are required." });
    if (reportedEmail === req.user.email.toLowerCase()) return res.status(400).json({ success: false, message: "You cannot report yourself." });
    await safetyReportsCollection.insertOne({
      type: "user-report", reporterId: req.user.userId, reporterEmail: req.user.email,
      reportedEmail, reason: reason.slice(0, 1000), details: String(req.body.details || "").slice(0, 3000),
      status: "open", createdAt: new Date()
    });
    return res.json({ success: true, message: "Report submitted." });
  } catch (error) {
    console.error("❌ Report error:", error);
    return res.status(500).json({ success: false, message: "Could not submit report." });
  }
});

app.post("/api/sos", authenticateToken, async (req, res) => {
  try {
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ success: false, message: "Valid location is required for SOS." });
    }
    const report = {
      type: "sos", userId: req.user.userId, email: req.user.email,
      latitude, longitude, tripId: req.body.tripId || null, status: "open", createdAt: new Date()
    };
    const result = await safetyReportsCollection.insertOne(report);
    io.emit("sos-alert", { id: result.insertedId.toString(), ...report });
    return res.json({ success: true, message: "SOS alert recorded.", alertId: result.insertedId });
  } catch (error) {
    console.error("❌ SOS error:", error);
    return res.status(500).json({ success: false, message: "Could not record SOS." });
  }
});

app.post("/api/live-trip/location", authenticateToken, async (req, res) => {
  try {
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return res.status(400).json({ success: false, message: "Valid location required." });
    const location = { latitude, longitude, accuracy: Number(req.body.accuracy) || null, updatedAt: new Date() };
    await usersCollection.updateOne({ _id: new ObjectId(req.user.userId) }, { $set: { activeTripLocation: location } });
    io.to(req.user.email).emit("trip-location-update", { userId: req.user.userId, ...location });
    return res.json({ success: true, location });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not update location." });
  }
});
function verificationScore(user) {
  let score = 0;

  const verification = user.verification || {};

  if (verification.email) {
    score += 10;
  }

  if (verification.phone) {
    score += 20;
  }

  if (verification.identity) {
    score += 25;
  }

  if (verification.selfie) {
    score += 20;
  }

  if (user.emergencyContact?.verified) {
    score += 10;
  }

  if (
    user.firstName &&
    user.lastName &&
    user.college &&
    user.bio
  ) {
    score += 5;
  }

  return Math.min(score, 100);
}

function badgeForScore(score) {
  if (score >= 75) {
    return "Safety Verified";
  }

  if (score >= 50) {
    return "Verified";
  }

  if (score >= 30) {
    return "Trusted";
  }

  return "Basic";
}
app.get("/api/safety-profile", authenticateToken, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ _id: new ObjectId(req.user.userId) });
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    const verification = user.verification || {};
    let score = 0;
    if (verification.email) score += 10;
    if (verification.phone) score += 20;
    if (verification.identity) score += 25;
    if (verification.selfie) score += 20;
    if (user.emergencyContact?.name && user.emergencyContact?.phone) score += 10;
    if (user.firstName && user.phone && user.gender) score += 5;
    const badge = score >= 75 ? "Safety Verified" : score >= 50 ? "Verified" : score >= 30 ? "Trusted" : "Basic";
    return res.json({ success: true, safetyScore: score, badge, verification, emergencyContact: user.emergencyContact || null });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load safety profile." });
  }
});

// =====================================================
// PING
// =====================================================

app.get(
  "/api/ping",
  (req, res) => {

    res.json({
      success: true
    });

  }
);


// =====================================================
// STATIC PAGES
// =====================================================

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


pages.forEach(
  (page) => {

    app.get(

      `/${page === "index"
        ? ""
        : page}`,

      (req, res) => {

        res.sendFile(

          path.join(

            __dirname,

            "public",

            `${page}.html`

          )

        );

      }

    );

  }
);


// =====================================================
// ROOT
// =====================================================

app.get(
  "/",
  (req, res) => {

    res.sendFile(

      path.join(

        __dirname,

        "public",

        "index.html"

      )

    );

  }
);


// =====================================================
// START SERVER
// =====================================================

const PORT =
  process.env.PORT || 5001;


server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `🚀 Server running on PORT ${PORT}`
    );

  }
);