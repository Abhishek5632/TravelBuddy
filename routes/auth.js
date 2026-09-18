const signupForm = document.getElementById("signupForm");

const baseURL = window.location.hostname === "localhost"
  ? "http://localhost:5001"
  : "https://travelbuddy-hluu.onrender.com";

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const email = document.getElementById("email").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const college = document.getElementById("college").value.trim();
  const age = document.getElementById("age").value;
  const travelStyle = document.getElementById("travelStyle").value;

  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  const aadhaar = document.getElementById("aadhaar").value.trim();

  const genderElement = document.getElementById("gender");
  const emergencyNameElement = document.getElementById("emergencyName");
  const emergencyPhoneElement = document.getElementById("emergencyPhone");

  const photoFile = document.getElementById("profilePhoto").files[0];

  // --------------------------------
  // BASIC VALIDATION
  // --------------------------------

  if (password !== confirmPassword) {
    return alert("Passwords do not match!");
  }

  if (!photoFile) {
    return alert("Please select a profile photo!");
  }

  // --------------------------------
  // SAFETY FIELD VALIDATION
  // --------------------------------

  if (!genderElement) {
    console.error("❌ Gender element not found");
    return alert("Gender field not found!");
  }

  if (!emergencyNameElement) {
    console.error("❌ Emergency name element not found");
    return alert("Emergency contact name field not found!");
  }

  if (!emergencyPhoneElement) {
    console.error("❌ Emergency phone element not found");
    return alert("Emergency contact phone field not found!");
  }

  const gender = genderElement.value.trim();
  const emergencyName = emergencyNameElement.value.trim();
  const emergencyPhone = emergencyPhoneElement.value.trim();

  if (!gender) {
    return alert("Please select your gender!");
  }

  if (!emergencyName) {
    return alert("Please enter emergency contact name!");
  }

  if (!emergencyPhone) {
    return alert("Please enter emergency contact phone!");
  }

  if (!/^\d{10}$/.test(emergencyPhone)) {
    return alert("Emergency contact phone must be 10 digits!");
  }

  // --------------------------------
  // CREATE USER DATA
  // --------------------------------

  const userData = {
    firstName,
    lastName,
    email,
    phone,
    college,
    age,
    travelStyle,
    password,

    // Safety information
    gender,

    emergencyContact: {
      name: emergencyName,
      phone: emergencyPhone
    },

    // Aadhaar
    aadhaar,

    // Newsletter
    newsletter: document.getElementById("newsletter")?.checked || false
  };

  // --------------------------------
  // DEBUG
  // --------------------------------

  console.log("🛡️ Signup data being sent:");
  console.log({
    ...userData,
    password: "[HIDDEN]"
  });

  // --------------------------------
  // READ PROFILE PHOTO
  // --------------------------------

  const reader = new FileReader();

  reader.onloadend = async () => {

    const imgBase64 = reader.result;

    // Add profile photo
    userData.profilePhoto = imgBase64;

    try {

      console.log("📡 Sending signup request to:", `${baseURL}/api/signup`);

      const res = await fetch(`${baseURL}/api/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(userData)
      });

      console.log("📥 Server status:", res.status);

      const data = await res.json();

      console.log("📦 Server response:", data);

      if (data.success) {

        localStorage.setItem(
          "user",
          JSON.stringify(data.user)
        );

        alert("Signup successful! Redirecting to profile...");

        window.location.href = "profile.html";

      } else {

        alert(data.message || "Signup failed, try again.");

      }

    } catch (err) {

      console.error("❌ Signup error:", err);

      alert("Error connecting to server.");

    }
  };

  reader.readAsDataURL(photoFile);
});