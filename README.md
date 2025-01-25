Live Link: https://collaborative-study-server-1vy0fpmtv-arafats-projects-0aa5d1a6.vercel.app/

This backend application is built using several technologies and libraries to handle the various functionalities required for your Collaborative Study Platform. Below is a detailed breakdown of the libraries and tools used, their purpose, and how they work together:

1. Express.js
*Purpose: Express.js is a fast, unopinionated web framework for Node.js, used to build web applications and APIs.

*Usage: It is used to create an HTTP server that listens to requests from clients. The routes defined in the code handle GET, POST, PUT, PATCH, and DELETE HTTP requests for managing users, study sessions, materials, reviews, notes, etc.

*How it works: Express handles routing (for example, app.get("/users", ...)), middleware (such as app.use(express.json()) to parse JSON bodies), and server setup.


2. MongoDB & MongoDB Node.js Driver
*Purpose: MongoDB is a NoSQL database, and the MongoDB Node.js driver is used to interact with it.

*Usage: The app uses MongoDB to store various data, including user information, study sessions, materials, reviews, notes, and booking details. The MongoClient is used to establish a connection with the MongoDB database.

*How it works: The MongoDB client is connected using the MongoDB URI, which contains credentials stored in environment variables. The client.db("collaborative-study") selects the database, and the collections (studySession, users, materials, etc.) are accessed to perform CRUD operations like insertOne(), find(), updateOne(), etc


3. dotenv
*Purpose: dotenv is used to load environment variables from a .env file into process.env in Node.js.

*Usage: It ensures that sensitive information like the database URI, Stripe secret key, and JWT secret key are not hardcoded into the source code, which improves security.

*How it works: The require("dotenv").config() loads environment variables, which can then be accessed via process.env.<VAR_NAME> (e.g., process.env.STRIP_SECRET_KEY for the Stripe secret key).


4. Stripe
*Purpose: Stripe is a payment processing platform that allows businesses to accept payments online.

*Usage: The server integrates Stripe to handle payment processing for study session bookings. The stript.paymentIntents.create() method creates a payment intent, which is used to process payments.

*How it works: The create-payment-intent endpoint accepts the registration fee, creates a payment intent on Stripe, and sends the client_secret back to the frontend. This client_secret is used to complete the payment on the client side.


5. JWT (JSON Web Tokens)
*Purpose: JWT is used for secure authentication and authorization in web applications.

*Usage: The server generates a JWT token on login (app.post("/jwt", ...)) and requires it to access protected routes via the verifyToken middleware.

*How it works: The server creates a JWT using the user data and a secret key (process.env.ACCESS_TOKEN_SECRET). The token is sent to the client, and for any subsequent requests to protected routes, the client must include the token in the authorization header. The verifyToken middleware checks the validity of the token by verifying it with the secret key.


6. CORS (Cross-Origin Resource Sharing)
*Purpose: CORS is a mechanism that allows restricted resources on a web page to be requested from another domain.

*Usage: The app uses CORS middleware to allow or restrict resources to be shared with different domains. This is crucial for frontend-backend communication when they are hosted on different domains or ports.

*How it works: By using app.use(cors()), it enables the server to accept cross-origin requests from any origin, ensuring that requests from the client-side frontend are not blocked.

7. MongoDB Collections (Study Sessions, Users, Materials, etc.)
*Purpose: MongoDB collections store specific types of data in the database.

*Usage: Several collections are used, such as:

*Study Sessions: Stores the details of study sessions, including tutor and student info.

*Users: Stores user data, including roles (admin, student, tutor).

*Materials: Stores the learning materials uploaded by tutors.

*Booked Sessions: Stores the bookings made by students for specific study sessions.

*Student Reviews: Stores reviews submitted by students.

*Student Notes: Stores the notes taken by students.

*How it works: The server uses MongoDB's insertOne(), find(), updateOne(), deleteOne(), and findOne() methods to interact with these collections to perform CRUD operations as per the defined API endpoints.


8. JWT Authorization Middleware (verifyToken)
*Purpose: To protect routes and ensure only authorized users can access certain resources.

*Usage: The middleware checks the validity of the JWT token in the request headers. If the token is invalid or missing, it returns an unauthorized error.

*How it works: The token is extracted from the Authorization header and is verified using the secret key. If valid, the request proceeds, otherwise, the request is rejected with a 401 Unauthorized error.


9. Routing & CRUD Operations
*Purpose: To provide different endpoints for managing users, study sessions, materials, and more.

*Usage: Different HTTP methods (GET, POST, PATCH, DELETE) are used for interacting with the MongoDB collections:

**GET: Retrieves data from the database.
**POST: Adds new data to the database.
**PATCH: Updates existing data.
**DELETE: Deletes data.

*How it works: Each route is associated with a specific action (e.g., creating a study session or fetching user data), and the corresponding CRUD operation is executed against the MongoDB database.

==============**************===================
Overall, this server acts as the backend for a collaborative study platform, managing users, study sessions, materials, and payments with appropriate authentication and authorization measures in place.