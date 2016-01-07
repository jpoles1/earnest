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
colmax = cbind(data.frame("State"="max"), t(data.frame(apply(statesums[,-1], 2, max))))
rownames(colmax) = c("max")
colmin = cbind(data.frame("State"="min"), t(data.frame(apply(statesums[,-1], 2, min))))
rownames(colmin) = c("min")
statesums = rbind(colmax, colmin, statesums)
rownames(statesums) = statesums$State
z = as.list(as.data.frame(t(statesums)))
jsontxt = toJSON(z)
writeLines(jsontxt, "statedata.json")