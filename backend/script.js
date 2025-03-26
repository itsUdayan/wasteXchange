const express = require("express");
const mysql = require("mysql2/promise"); 
const bcrypt = require("bcrypt");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const path = require("path");
const multer = require("multer");

const app = express();
app.use(express.json());
app.use(cors());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));


const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "Udayan@66",
  database: "wastexchange",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

app.post("/register", async (req, res) => {
  const { name, email, password, user_type } = req.body;

  if (!name || !email || !password || !user_type) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const connection = await db.getConnection();

    const [existingUser] = await connection.query("SELECT * FROM users WHERE email = ?", [email]);
    if (existingUser.length > 0) {
      connection.release();
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [userResult] = await connection.query(
      "INSERT INTO users (name, email, password, user_type) VALUES (?, ?, ?, ?)",
      [name, email, hashedPassword, user_type]
    );

    const user_id = userResult.insertId; 

    if (user_type === "Industry") {
      await connection.query("INSERT INTO industries (user_id) VALUES (?)", [user_id]);
    }

    if (user_type === "Start-Up") {
      await connection.query("INSERT INTO startups (user_id) VALUES (?)", [user_id]);
    }

    connection.release();
    res.status(201).json({ message: "User registered successfully", user_id });

  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.post("/login", async (req, res) => {
    const { email, password } = req.body;
  
    if (!email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }
  
    try {
      const connection = await db.getConnection(); 
  
      const [user] = await connection.query("SELECT * FROM users WHERE email = ?", [email]);
      connection.release(); 
  
      if (user.length === 0) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
  
      const isMatch = await bcrypt.compare(password, user[0].password);
      if (!isMatch) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
  
      const token = jwt.sign({ id: user[0].id, email: user[0].email }, "e3f1b58f9b1d2a3c4d5e6f708192a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7", { expiresIn: "1h" });
  
      res.status(200).json({ message: "Login successful", token });
  
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/addIndustryDetails", async (req, res) => {
    const { user_id, companyName, address, sector } = req.body;

    if (!user_id || !companyName || !address || !sector) {
        return res.status(400).json({ error: "All fields are required" });
    }

    try {
        const connection = await db.getConnection();

        // Fetch the industry_id for this user before updating
        const [existingIndustry] = await connection.query(
            "SELECT industry_id FROM industries WHERE user_id = ?",
            [user_id]
        );

        if (existingIndustry.length === 0) {
            connection.release();
            return res.status(404).json({ error: "Industry details not found for this user." });
        }

        const industry_id = existingIndustry[0].industry_id;

        // Update the existing record
        await connection.query(
            "UPDATE industries SET company_name = ?, location = ?, sector = ? WHERE user_id = ?",
            [companyName, address, sector, user_id]
        );

        connection.release();

        res.status(200).json({ message: "Industry details updated successfully", industry_id });
    } catch (err) {
        console.error("Error updating industry:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});
  app.post("/addStartUpDetails", async (req, res) => {
    const { user_id, companyName, address, sector } = req.body;
  
    if (!user_id || !companyName || !address || !sector) {
        return res.status(400).json({ error: "All fields are required" });
    }

    try {
        const connection = await db.getConnection();

        const [existing] = await connection.query(
            "SELECT * FROM startups WHERE user_id = ?",
            [user_id]
        );

        if (existing.length > 0) {
            await connection.query(
                "UPDATE startups SET company_name = ?, location = ?, sector = ? WHERE user_id = ?",
                [companyName, address, sector, user_id]
            );
        } else {
            await connection.query(
                "INSERT INTO startups (user_id, company_name, location, sector) VALUES (?, ?, ?, ?)",
                [user_id, companyName, address, sector]
            );
        }

        connection.release();
        res.status(201).json({ message: "Start-Up details updated successfully" });

    } catch (err) {
        console.error("Error updating Start-Up:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

const storage = multer.diskStorage({
  destination: "./uploads/",
  filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

app.post("/materials", upload.single("image"), (req, res) => {
  const { user_id, name, type, price, unit, description } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!user_id || !name || !type || !price || !unit || !description) {
    return res.status(400).json({ error: "All fields are required." });
  }

  if (!imagePath) {
    return res.status(400).json({ error: "Image upload failed. Please try again." });
  }

  const query = "INSERT INTO materials (user_id, name, type, price, unit, description, image_path) VALUES (?, ?, ?, ?, ?, ?, ?)";
  db.query(query, [user_id, name, type, price, unit, description, imagePath], (err, result) => {
    if (err) {
      console.error("MySQL Insert Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.status(200).json({ 
      message: "Material added successfully", 
      material_id: result.insertId,
      image_path: imagePath 
    });
  });
});

app.get("/materials", async (req, res) => {
  const query = `
    SELECT 
      materials.material_id,
      materials.name,
      materials.type,
      materials.price,
      materials.unit,
      materials.description,
      materials.image_path,
      users.name AS user_name
    FROM materials
    INNER JOIN users ON materials.user_id = users.user_id
  `;

  try {
    const [results] = await db.query(query);

    res.status(200).json(results);
  } catch (err) {
    console.error("Error fetching materials:", err);
    res.status(500).json({ message: "Failed to fetch materials" });
  }
});

app.get("/material/:material_id", async (req, res) => {
  const { material_id } = req.params;

  try {
    // Fetch material details from the database
    const [results] = await db.query(
      `
      SELECT materials.*, users.name AS user_name
      FROM materials
      INNER JOIN users ON materials.user_id = users.user_id
      WHERE materials.material_id = ?
      `,
      [material_id]
    );

    if (results.length === 0) {
      return res.status(404).json({ error: "Material not found" });
    }

    res.status(200).json(results[0]);
  } catch (error) {
    console.error("Error fetching material details:", error);
    res.status(500).json({ error: "Failed to fetch material details" });
  }
});

app.get("/material/search", (req, res) => {
  const searchQuery = req.query.query?.trim(); // Access query parameter using req.query
  console.log("Search Query (Backend):", searchQuery);

  if (!searchQuery) {
    return res.status(400).json({ error: "Search query required" });
  }

  const sql = "SELECT * FROM materials WHERE LOWER(name) LIKE LOWER(?)";

  db.query(sql, [`%${searchQuery}%`], (err, results) => {
    if (err) {
      console.error("Database query error:", err);
      return res.status(500).json({ error: "Database query error" });
    }

    console.log("Database results:", results);

    if (results.length === 0) {
      return res.status(404).json({ message: "Material not found" });
    }

    res.json(results);
  });
});

  
app.listen(5000, () => {
  console.log("Server running on port 5000");
});
