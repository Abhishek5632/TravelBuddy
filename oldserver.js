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

dotenv.config();

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

        // Create JWT
        const token = jwt.sign(
            {
                userId: user._id.toString(),
                email: user.email
            },
            JWT_SECRET,
            {
                expiresIn: "7d"
            }
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

    req.user = decoded;

    next();

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

    const {
      email,
      ...updates
    } = req.body;


    if (!email) {

      return res.json({

        success: false,

        message:
          "Missing email"

      });

    }


    if (updates._id) {

      delete updates._id;

    }


    const result =
      await usersCollection.updateOne(

        {
          email
        },

        {
          $set:
            updates
        }

      );


    if (
      result.modifiedCount === 0
    ) {

      return res.json({

        success: false,

        message:
          "No changes or user not found"

      });

    }


    const updatedUser =
      await usersCollection.findOne({
        email
      });


    console.log(
      "✏️ Profile updated:",
      email
    );


    res.json({

      success: true,

      user:
        updatedUser

    });


  } catch (err) {

    console.error(
      "❌ Update profile error:",
      err
    );


    res.status(500).json({

      success: false,

      message:
        "Server error"

    });

  }

});


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
// ADD TRIP
// =====================================================

app.post(
  "/api/add-trip",
  async (req, res) => {

    try {

      const {
        email,
        destination,
        date,
        budget,
        notes
      } = req.body;


      if (
        !email ||
        !destination ||
        !date
      ) {

        return res.json({

          success: false,

          message:
            "Missing fields"

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
          email
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
  async (req, res) => {

    try {

      const {
        fromEmail,
        toEmail
      } = req.body;


      if (
        !fromEmail ||
        !toEmail
      ) {

        return res.json({

          success: false,

          message:
            "Missing fields"

        });

      }


      const fromUser =
        await usersCollection.findOne({

          email:
            fromEmail

        });


      const toUser =
        await usersCollection.findOne({

          email:
            toEmail

        });


      if (
        !fromUser ||
        !toUser
      ) {

        return res.json({

          success: false,

          message:
            "User(s) not found"

        });

      }


      const pending =
        (toUser.requests || [])
          .some(

            (r) =>

              r.fromEmail ===
                fromEmail &&

              r.status ===
                "pending"

          );


      if (pending) {

        return res.json({

          success: false,

          message:
            "Already sent"

        });

      }


      const requestObj = {

        fromEmail,

        fromName:
          fromUser.firstName,

        status:
          "pending",

        createdAt:
          new Date().toISOString()

      };


      await usersCollection.updateOne(

        {
          email:
            toEmail

        },

        {

          $push: {

            requests:
              requestObj

          }

        }

      );


      await usersCollection.updateOne(

        {
          email:
            fromEmail

        },

        {

          $push: {

            sentRequests: {

              toEmail,

              status:
                "pending"

            }

          }

        }

      );


      io.to(toEmail).emit(
        "request-received",
        requestObj
      );


      res.json({

        success: true

      });


    } catch (err) {

      console.error(
        "❌ send-request error:",
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
// GET REQUESTS
// =====================================================

app.get(
  "/api/requests",
  async (req, res) => {

    const {
      email
    } = req.query;


    try {

      const user =
        await usersCollection.findOne({
          email
        });


      if (!user) {

        return res.json({

          success: false,

          requests: [],

          sentRequests: []

        });

      }


      res.json({

        success: true,

        requests:
          user.requests || [],

        sentRequests:
          user.sentRequests || []

      });


    } catch (err) {

      console.error(
        "❌ /api/requests error:",
        err
      );


      res.json({

        success: false

      });

    }

  }
);


// =====================================================
// RESPOND REQUEST
// =====================================================

app.post(
  "/api/respond-request",
  async (req, res) => {

    try {

      const {
        toEmail,
        fromEmail,
        action
      } = req.body;


      if (
        !["accept", "reject"]
          .includes(action)
      ) {

        return res.json({

          success: false

        });

      }


      if (
        action === "accept"
      ) {


        await usersCollection.updateOne(

          {
            email:
              toEmail,

            "requests.fromEmail":
              fromEmail

          },

          {

            $set: {

              "requests.$.status":
                "accept"

            }

          }

        );


        await usersCollection.updateOne(

          {
            email:
              fromEmail,

            "sentRequests.toEmail":
              toEmail

          },

          {

            $set: {

              "sentRequests.$.status":
                "accept"

            }

          }

        );


        await usersCollection.updateOne(

          {
            email:
              toEmail

          },

          {

            $addToSet: {

              connections:
                fromEmail

            }

          }

        );


        await usersCollection.updateOne(

          {
            email:
              fromEmail

          },

          {

            $addToSet: {

              connections:
                toEmail

            }

          }

        );

      }


      else if (
        action === "reject"
      ) {


        await usersCollection.updateOne(

          {
            email:
              toEmail

          },

          {

            $pull: {

              requests: {

                fromEmail:
                  fromEmail

              }

            }

          }

        );


        await usersCollection.updateOne(

          {
            email:
              fromEmail

          },

          {

            $pull: {

              sentRequests: {

                toEmail:
                  toEmail

              }

            }

          }

        );

      }


      res.json({

        success: true

      });


    } catch (err) {

      console.error(
        "❌ /api/respond-request error:",
        err
      );


      res.json({

        success: false

      });

    }

  }
);


// =====================================================
// CHAT
// =====================================================

app.get(
  "/api/get-chat",
  async (req, res) => {

    try {

      const {
        user1,
        user2
      } = req.query;


      const usersPair =
        [
          user1,
          user2
        ].sort();


      const chat =
        await chatsCollection.findOne({

          users:
            usersPair

        });


      res.json({

        success: true,

        messages:
          chat
            ? chat.messages
            : [],

        chatId:
          chat
            ? chat._id
            : null

      });


    } catch (err) {

      console.error(
        "❌ /api/get-chat error:",
        err
      );


      res.json({

        success: false

      });

    }

  }
);


app.post(
  "/api/send-message",
  async (req, res) => {

    try {

      const {
        from,
        to,
        text
      } = req.body;


      if (
        !from ||
        !to ||
        !text
      ) {

        return res.json({

          success: false,

          message:
            "Missing fields"

        });

      }


      const usersPair =
        [
          from,
          to
        ].sort();


      const msg = {

        sender:
          from,

        text,

        time:
          new Date().toISOString()

      };


      await chatsCollection.updateOne(

        {
          users:
            usersPair

        },

        {

          $push: {

            messages:
              msg

          },

          $setOnInsert: {

            users:
              usersPair,

            createdAt:
              new Date().toISOString()

          }

        },

        {
          upsert:
            true
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


      res.json({

        success: true

      });


    } catch (err) {

      console.error(
        "❌ /api/send-message error:",
        err
      );


      res.json({

        success: false

      });

    }

  }
);


// =====================================================
// USER PROFILE
// =====================================================

app.get(
  "/api/user-profile",
  async (req, res) => {

    try {

      const email =
        req.query.email;


      const user =
        await usersCollection.findOne({
          email
        });


      if (!user) {

        return res.json({

          success: false,

          message:
            "Not found"

        });

      }


      res.json({

        success: true,

        user

      });


    } catch (err) {

      console.error(
        "❌ /api/user-profile error:",
        err
      );


      res.json({

        success: false

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