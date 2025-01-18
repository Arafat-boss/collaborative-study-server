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

    //jwt
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d",
      });
      res.send({ token });
    });
    //verifyToken
    const verifyToken = (req, res, next) => {
      // console.log('VerifyToken teke',req.headers.authorization);
      if(!req.headers.authorization){
        return res.status(401).send({message: 'Unauthorized access'})
      }
      const token = req.headers.authorization.split(' ')[1];
     jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded)=>{
      if(error){
        return res.status(401).send({message: 'Unauthorized access'})
      }
      req.decoded = decoded;
      next()
     })
    };

    //user related API's
    app.get("/users",verifyToken, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });
    //admin users API's
    app.get('/user/admin/:email', async(req, res)=>{
      const email = req.params.email;
      console.log(email);
      const query = {email: email}
      const result = await userCollection.findOne(query)
      console.log(result?.role);
      res.send(result?.role)


      // if(email !== req.decoded.email){
      //   return res.status(403).send({message: 'Forbidan access'})
      // }
      // const query = {email: email}
      // const user = await userCollection.findOne(query)
      // let admin = false;
      // let tutor = false;
      // let student = false;
      // if(user){
      //   admin = user.role ==="admin";
      //   tutor = user.role ==="tutor";
      //   student = user.role ==="student";
      // }
      // res.send({admin, tutor, student})
    })

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
    app.patch("/users/role/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      console.log(data);
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: data,
        },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });



    //tutor related API's
    app.get("/studySession", async (req, res) => {
      const result = await studySessionCollection.find().toArray();
      res.send(result);
    });
    app.get("/studySession/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { tutorEmail: email };
      const result = await studySessionCollection.find(filter).toArray();
      res.send(result);
    });
    //reject session patch---
    app.patch('/sessions/reject/:id', async(req, res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const update ={
            $set: {status: 'reject'},
          } 
      const result = await studySessionCollection.updateOne(query, update)
      res.send(result)
    })
    //success session patch---
    app.patch('/sessions/success/:id', async(req, res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const update ={
            $set: {status: 'success'},
          } 
      const result = await studySessionCollection.updateOne(query, update)
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
    //---
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

    app.get("/materials", async (req, res) => {
      const result = await uploadMaterialsCollection.find().toArray();
      res.send(result);
    });
    //delete
    app.delete("/materials/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await uploadMaterialsCollection.deleteOne(query);
      res.send(result);
    });
    //update
    app.put('/material/:id', async(req, res)=>{
      const id = req.params.id;
      const materials = req.body;
      const filter = {_id: new ObjectId(id)}
      const option = { upsert: true };
      const update ={
        $set: materials,
      }
      const result = await uploadMaterialsCollection.updateOne(
        filter,
        update,
        option
      );
      res.send(result)
    })

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
