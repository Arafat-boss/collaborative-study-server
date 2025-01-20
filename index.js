const express = require("express");
const app = express();
require("dotenv").config();
const jwt = require("jsonwebtoken");
const cors = require("cors");
const port = process.env.PORT || 9000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

//mid
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ybjyx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const studySessionCollection = client
      .db("collaborative-study")
      .collection("studySession");
    const userCollection = client.db("collaborative-study").collection("users");
    const uploadMaterialsCollection = client
      .db("collaborative-study")
      .collection("materials");
    const bookedSessionsCollection = client
      .db("collaborative-study")
      .collection("booked-sessions");

    //jwt===================
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d",
      });
      res.send({ token });
    });
    //verifyToken===========
    const verifyToken = (req, res, next) => {
      // console.log('VerifyToken teke',req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
          return res.status(401).send({ message: "Unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    //************user related API's Here***************
    app.get("/users", verifyToken, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });
    // users role API's
    app.get("/user/admin/:email", async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const query = { email: email };
      const result = await userCollection.findOne(query);
      console.log(result?.role);
      res.send(result?.role);
    });

    //user information save just 1st time
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });
    //filter specific role (like- student, tutor, admin)
    app.patch("/users/role/:id", async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      const query = { _id: new ObjectId(id) };
      console.log(role);
      const updateDoc = {
        $set: {
          role,
        },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    //************tutor related API's Here***************
    app.get("/studySession", async (req, res) => {
      const result = await studySessionCollection.find().toArray();
      res.send(result);
    });

    //home page get specific data
    app.get("/study/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await studySessionCollection.findOne(query);
      res.send(result);
    });
    //specific tutor, specific data filter
    app.get("/studySession/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { tutorEmail: email };
      const result = await studySessionCollection.find(filter).toArray();
      res.send(result);
    });
    //reject session patch---by admin
    app.patch("/sessions/reject/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: { status: "reject" },
      };
      const result = await studySessionCollection.updateOne(query, update);
      res.send(result);
    });


    //success session patch---by admin
    //fee update session patch---by admin
    app.patch('/sessions/success/:id', async(req, res)=>{
      const id = req.params.id;
      const {registrationFee} = req.body;
      const query = {_id: new ObjectId(id)}
      const update ={
            $set: {status: 'success', registrationFee},
          }
      const result = await studySessionCollection.updateOne(query, update)
      res.send(result)
    })

    //delete success session
    app.delete('/deleted/session/:id', async(req, res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await studySessionCollection.deleteOne(query)
      res.send(result)
    })

    //create study session
    app.post("/studySession", async (req, res) => {
      const session = req.body;
      const result = await studySessionCollection.insertOne(session);
      res.send(result);
    });

    //upload materials
    app.post("/materials", async (req, res) => {
      const material = req.body;
      const result = await uploadMaterialsCollection.insertOne(material);
      res.send(result);
    });
    //---specific tutor materials
    app.get("/materials/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { tutorEmail: email };
      const result = await uploadMaterialsCollection.find(filter).toArray();
      res.send(result);
    });
    //----
    app.get("materials/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await uploadMaterialsCollection.findOne(query);
      res.send(result);
    });
    //---

    app.get("/allMaterials", async (req, res) => {
      try {
        const result = await uploadMaterialsCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching materials:", error);
        res.status(500).send({ error: "Failed to fetch materials" });
      }
    });

    //materials delete
    app.delete("/materials/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await uploadMaterialsCollection.deleteOne(query);
      res.send(result);
    });
    //materials update
    app.put("/material/:id", async (req, res) => {
      const id = req.params.id;
      const materials = req.body;
      const filter = { _id: new ObjectId(id) };
      const option = { upsert: true };
      const update = {
        $set: materials,
      };
      const result = await uploadMaterialsCollection.updateOne(
        filter,
        update,
        option
      );
      res.send(result);
    });



    //************student related API's Here***************
    app.post("/booked-sessions", async (req, res) => {
      const bookedSessions = req.body;
      const result = await bookedSessionsCollection.insertOne(bookedSessions);
      res.send(result);
    });

    app.get("/booked-sessions", async (req, res) => {
      const result = await bookedSessionsCollection.find().toArray();
      res.send(result);
    });

    // specific student booked data
    app.get("/bookedSessions/:email", async (req, res) => {
      const email = req.params.email;
      const query = { user: email };
      const result = await bookedSessionsCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/bookedDetails/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookedSessionsCollection.find(query).toArray();
      res.send(result);
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is Working");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
