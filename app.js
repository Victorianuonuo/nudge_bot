var logger = require('morgan');
var {Apikey, SlackKey, UserPresence} = require('./models/models');
var mongoose = require('mongoose');
var command = require('./routes/command');
var apikey = require('./routes/apikey');
var _ = require('underscore');
var {bot, authenResuetime, getMonday} = require('./bot');
var passport = require('passport');
var RescueTimeStrategy = require('passport-rescuetime').Strategy;
var SlackStrategy = require('passport-slack-oauth2').Strategy;
var axios = require('axios');

var https = require("https");
setInterval(function() {
    https.get(process.env.DOMAIN);
    console.log("keepwake");
}, 300000); // every 5 minutes (300000)
//This is for the wake process, mongthly quoto limited

function execHourly(func){
    var date = new Date();
    var dateIntegralPoint = new Date();
    dateIntegralPoint.setHours(date.getHours()+1);
    dateIntegralPoint.setMinutes(0);
    dateIntegralPoint.setSeconds(0);
    setTimeout(func, dateIntegralPoint-date);
}

function queryPrecense(){
    setInterval(function() {
        SlackKey.find({}, function(err, users) {
            if(err){
                console.log(err);
            }else{
                users.forEach(function(user) {
                    console.log("queryPresence for ", user.slackID);
                    queryPresenceForUser(user.slackID, user.access_token);
                });
            }
        });
    }, 3600000); // every 60 minutes (3600000)
    //}, 60000); // every 1 minutes (60000)
}

execHourly(queryPrecense);

function queryPresenceForUser(slackID, access_token){
    var url = "https://slack.com/api/users.getPresence?token="+access_token+"&user="+slackID+"&pretty=1";
    axios.get(url).then(function(response){
        UserPresence.findOne({slackID: slackID}).exec(function(err, user){
            if(err){
                console.log(err);
            } else {
                //console.log(user);
                //console.log("response,",response.data);
                var userPresence = user;
                if(!userPresence){
                    userPresence = new UserPresence({
                        slackID: slackID
                    });
                }
                userPresence.presences.push({queryTime:Math.round(+new Date()/1000)+"",queryResult:JSON.stringify(response.data)});
                userPresence.save().then(()=>{})
                .catch((err) => {
                    console.log('error in save queryPresenceForUser', slackID);
                    console.log(err);
                });
            }
        });
    }).catch(function(error){
        console.log("error when query ", slackID);
        console.log(error);
    });
}

mongoose.connect(process.env.MONGODB_URI,{ useNewUrlParser: true });
mongoose.Promise = global.Promise;
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
app.use(logger('dev'));
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(passport.initialize());
const PORT=3000;

passport.use(new RescueTimeStrategy({
    clientID: process.env.RESCUETIME_ID,
    clientSecret: process.env.RESCUETIME_SECRET,
    callbackURL: process.env.DOMAIN+"/apikey/rescuetime/callback",
    passReqToCallback: true,
    scope: ['time_data', 'category_data', 'productivity_data', 'alert_data', 'highlight_data', 'focustime_data']
  },
  function(req, accessToken, refreshToken, profile, done) {
    //console.log("RescueTimeStrategy connect through button, accessToken, refreshToken, profile", accessToken, refreshToken, profile);
    //console.log("slackID:", req.query.state);
    Apikey.findOne({slackID: req.query.state}).exec(function(err, apikey){
        if(err){
            console.log(err);
            done(err, apikey);
        } else {
            console.log("apikey, ", apikey);
            if(apikey){
                var newApikey = apikey;
                newApikey.rescuetime_key = accessToken;
            }else{
                var newApikey = new Apikey({
                    slackID: req.query.state,
                    rescuetime_key: accessToken,
                });
            }
            console.log("newApikey, ", newApikey);
            newApikey.save()
            .then( () => {
                done(err, newApikey);
            })
            .catch((err) => {
                done(err, newApikey);
            });
        }
    });
  }
));

passport.use(new SlackStrategy({
    clientID: process.env.SLACK_ID,
    clientSecret: process.env.SLACK_SECRET,
    callbackURL: process.env.DOMAIN+"/apikey/slack/callback",
    skipUserProfile: false, // default
    passReqToCallback: true,
    scope: ['users:read', 'identity.basic']
  },
  (req, accessToken, refreshToken, profile, done) => {
    //console.log("Slack connect through button, accessToken, refreshToken, profile", accessToken, refreshToken, profile);
    //console.log("slackID:", req.query.state);
    SlackKey.findOne({slackID: req.query.state}).exec(function(err, apikey){
        if(err){
            console.log(err);
            done(err, apikey);
        } else {
            //console.log("apikey, ", apikey);
            if(apikey){
                var newApikey = apikey;
                newApikey.access_token = accessToken;
            }else{
                var newApikey = new SlackKey({
                    slackID: req.query.state,
                    access_token: accessToken,
                });
            }
            //console.log("newApikey, ", newApikey);
            newApikey.save()
            .then( () => {
                done(err, newApikey);
            })
            .catch((err) => {
                done(err, newApikey);
            });
        }
    });
  }
));

app.get('/', function(req, res) {
    res.send('Nudgebot is working! Path Hit: ' + req.url);
});

app.use('/command', command);
app.use('/apikey', apikey);

app.listen(process.env.PORT || 3000);

