require(jsonlite)
rawdata = read.csv("directloan.csv", strip.white = T)
rawdata$School = sapply(rawdata$School, trimws)
rawdata$StateAbrev = rawdata$State
abrevtable = read.csv("stateabrev.csv")
rownames(abrevtable) = abrevtable$code
rawdata$State = sapply(rawdata$State, function(x) (abrevtable[x,"name"]))
jsontxt = toJSON(rawdata)
writeLines(jsontxt, "alldata.json")
statesums = aggregate(cbind(num.originated, amt.originated, num.disbursed, amt.disbursed)~State, rawdata, sum)
jsontxt = toJSON(statesums)
writeLines(jsontxt, "statedata.json")