//install modules express dotenv body-parser aws-sdk cors multer multer-s3s
require('dotenv').config() //initialize config (use dotenv to load into process.env)

const express = require('express')
const cors = require('cors')

//for digital ocean aws upload
const multer = require('multer'), 
    AWS = require('aws-sdk'),
    multers3 = require('multer-s3'),
    config = require('./config.json') //create config.json to store keys and import for AWS
    
//for mysqlDB
const mysql = require('mysql2/promise')


//instantiate express
const app = express()
app.use(cors())
//set up encoding for receiving data
app.use(express.urlencoded({limit: '50mb', extended: true})) //esp required for html form POSTs 
app.use(express.json({limit: '50mb'}))


//express configs
const APP_PORT = process.env.APP_PORT

//AWS configs
const AWS_S3_HOSTNAME = process.env.AWS_S3_HOSTNAME,
    AWS_S3_ACCESS_KEY = config.accessKeyId || process.env.AWS_S3_ACCESS_KEY,
    AWS_S3_SECRET_ACCESSKEY = config.secretAccessKey || process.env.AWS_S3_SECRET_ACCESSKEY,
    AWS_S3_BUCKETNAME = process.env.AWS_S3_BUCKETNAME //bucketname is name of space on DO
const spaceEndPoint = new AWS.Endpoint(AWS_S3_HOSTNAME) //pass in hostname here

//pool configs
const pool = mysql.createPool({
    host: process.env.MYSQL_SERVER,
    port: process.env.MYSQL_SVR_PORT,
    user: process.env.MYSQL_USERNAME,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_SCHEMA,
    connectionLimit: process.env.MYSQL_CON_LIMIT
})


// SQL Statements
const SQL_ADD_TODO = 'insert into todo_list (todo_name, due_date, priority) values (? , ?, ?);'
const SQL_GET_TODO = 'select * from todo_list;'
const SQL_ADD_TASK = 'insert into task (todo_id, name, status) values (?,?, ?);'
const SQL_GET_TASK = 'select * from task;'


//generic makeQuery
const makeQuery = (sqlStmt, pool) => {
    return (async (args) => {
        const conn = await pool.getConnection()
        try {
            let results = await conn.query(sqlStmt, args || [])
            return results[0] //results is [data, metadata]
        }catch(err){
            console.error(err)
        }finally{
            conn.release() // always release when you end query
        }
    })
}

//closure fns
const insertTodoInSQL = makeQuery(SQL_ADD_TODO, pool)
const getTodoInSQL = makeQuery(SQL_GET_TODO, pool)
const addTaskInSQL = makeQuery(SQL_ADD_TASK,  pool)
const getTaskInSQL = makeQuery(SQL_GET_TASK, pool)

//POST /addtodo
app.post('/addtodo', (req, resp) => {
    console.log("reached express")
    const result = req.body
    console.log("received in express: ", result)
    
    let dataInput = [result.name, result.dueDate, result.priority]
    insertTodoInSQL(dataInput).then( res=>
        resp.status(200).json(res)
    ).catch(err => {
        console.error("Fail adding to mysql: ", err)
        resp.status(500).json(err)
    })
})


//GET /todo
app.get("/gettodo", (req, resp) => {
    getTodoInSQL([]).then(result => {
        console.info("retrieved from sql: ", result)
        console.log("results from sql in express: ", result)
        resp.status(200).json(result)
    }).catch(e => {
        console.error("sql retrieval error", err)
        resp.status(500).json(err)
    })
})

//POST /tasks/todo/:id
app.post("/tasks/todo/:id", (req, resp)=> {
    let todo_id = req.params['id']
    console.log(todo_id)
    addTaskInSQL([todo_id, "drink", "1"]).then(result => {
        console.log("insert task successful")
        resp.status(200).json(result)
    }).catch(e => {
        console.error("Error inserting task: ", e)
        resp.status(500).json(e)
        })
})

//GET /tasks/todo/:id
app.get("/tasks/todo/:id", (req, resp)=> {
    let todo_id = req.params.id
    console.log(todo_id)
    getTaskInSQL([]).then(result => {
        console.log("get task successful")
        resp.status(200).json(result)
    }).catch(e => {
        console.error("Error getting task: ", e)
        resp.status(500).json(e)
        })
})

//For AWS Digital Ocean access
//set up access and secretAcessKey - load keys from profile and assign to credentials
//create credentials at c:\users\username\.aws\credentials
//add [profilename - use bucketname for safety] aws_access_key_id= \n aws_secret_access_key=
//these are loaded from .aws/credentials 
AWS.config.credentials = new AWS.SharedIniFileCredentials('ac-paf2020') //profilename

//create s3 obj
const s3 = new AWS.S3({   
    endpoint: spaceEndPoint,
    accessKeyId: AWS_S3_ACCESS_KEY,
    secretAccessKey: AWS_S3_SECRET_ACCESSKEY, 
})

const upload = multer({
    storage: multers3({ //storage is where you want to store this
        s3,
        bucket: AWS_S3_BUCKETNAME,
        acl: "public-read", //if they want to retrieve they can read and retrieve but cannot upload
        metadata: function(req, file, cb){
            cb(null, { //callback null and specify metadata of file
                'fileName': file.fieldname,
                'originalFilename': file.originalname,
                'uploadDatetime': new Date().toString(), //metadata cannt take in obj so convert to string
                'uploader': req.body.uploader, // if u are using form instead of talend/postman query to send in the data, change req.query to req.body
                'note': req.body.note //same for here change req.query to req.body since data is now coming from form body
            })
        },
            //specify metadata
        key: function(request, file, cb) { //cb= callback
            console.log("file ", file)
            cb(null, new Date().getTime() + '_' + file.originalname) //first parameter is null, second is filename
        }
    }),
}).array('image-file',1)//adjust the array to accept number of files to 1, image-file is the form data key, also boundary of the file uploaded
//can use .single('image-file') to replace the .array above to upload single file also


app.post('/upload', (req, resp, next) => {
    upload(req, resp, (error) => {
        if(error){
            console.log(error);
            return resp.status(500).json(error.message)
        }
        console.log('file successfully uploaded');

        console.log(resp.req.files[0].location)
        resp.status(200).json({
            message: 'uploaded',
            s3_file_key: resp.req.files[0].location // url of img uploaded to digital ocean
        });
    })
})


//ur filename on digitalocean is ur key

//GET /blob/:id
app.get('/blob/:id', (req, resp) => {
    const fileId = req.params.id
    console.log("fileId: ", fileId)
    //set params for accessing s3 
    var params = {
        Bucket: AWS_S3_BUCKETNAME,
        Key: fileId 
    }

    //retrieve file from s3
    s3.getObject(params, (err, result) => {
        if (err) {
            //console.log(err, err.stack)
            console.error("No file found! ",err.message)
        }
        else {
            console.log(result)
            //# recommended to copy metadata out from data obj, change and then set it back
            let mdata = result.Metadata
            result.Metadata = {
                'X-Original-Name': mdata.originalfilename,
                'X-Create-Time': mdata.uploaddatetime,
                'X-Uploaded': mdata.uploader,
                'X-Notes': mdata.note
            }

            let fileData = result.Body.toString('utf-8')
            //resp.send(fileData)
            resp.send(result)
            // result.ContentType
            //console.log(result.Metadata)
            //result.set()
            // result.Body - file data in bytes
        }
    })

})



app.listen(APP_PORT, () => {
    console.log(`App started on port ${APP_PORT}`)
})