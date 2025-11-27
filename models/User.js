const mongoose = require("mongoose");

const requestSchema = new mongoose.Schema({
    fromEmail: String,
    fromName: String,
    trip: Object,
    status: {
        type: String,
        enum: ["pending", "accepted", "rejected"],
        default: "pending"
    },
    date: { type: Date, default: Date.now }
});

const blogSchema = new mongoose.Schema({
    title: String,
    content: String,
    snippet: String,
    createdAt: { type: Date, default: Date.now }
});

const tripSchema = new mongoose.Schema({
    destination: String,
    date: String,
    description: String
});

const userSchema = new mongoose.Schema({
    firebaseUid: {
        type: String,
        required: true,
        unique: true
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },

    firstName: String,
    lastName: String,
    college: String,
    bio: String,
    img: String,

    // ⭐ ⭐ IMPORTANT FOR REQUEST FEATURE ⭐ ⭐
    requests: [requestSchema],        // incoming requests
    sentRequests: [requestSchema],    // outgoing requests
    connections: [String],            // list of connected emails

    // Trips
    trips: [tripSchema],
    totalDistance: { type: Number, default: 0 },
    rating: { type: Number, default: "N/A" },

    // Blogs
    blogs: [blogSchema],

    // Badges
    badges: [String],

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", userSchema);
